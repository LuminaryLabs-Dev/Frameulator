import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ApplicationGate, loadReleaseRegistry, verifyReleaseRegistry } from "../dist/frameulator.js";

const packageBytes = new TextEncoder().encode("generic application package bytes");
// Deliberately not executable WebAssembly: the gate must only verify identity, never execute.
const artifactBytes = new TextEncoder().encode("signed browser artifact verification fixture");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const trustedKeys = [{
  id: "release-signing-key",
  algorithm: "Ed25519",
  publicKeyBase64: publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"),
}];

function release(overrides = {}) {
  return {
    appId: "org.example.ControlPanel",
    version: "2.10.3-beta.1+build.9",
    sourceCommit: "a".repeat(40),
    adapterId: "control-panel",
    adapterVersion: "1.2.0",
    packageFile: "panel.bundle",
    packageSha256: hash(packageBytes),
    artifactFile: "./panel.wasm",
    artifactSha256: hash(artifactBytes),
    executionMode: "browser-wasm-capsule",
    capsuleAbi: 1,
    ...overrides,
  };
}

function signed(releases = [release()]) {
  const payload = { releases };
  return {
    schemaVersion: 1, algorithm: "Ed25519", keyId: trustedKeys[0].id, payload,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString("base64"),
  };
}

function packageBlob(bytes = packageBytes, name = "user-renamed.package") {
  const blob = new Blob([bytes]);
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

async function gate(options = {}) {
  return new ApplicationGate({
    releases: await verifyReleaseRegistry(signed(), trustedKeys),
    maximumBytes: 4096,
    maximumArtifactBytes: 4096,
    registryBaseUrl: new URL("https://example.test/releases/registry.json"),
    ...options,
  });
}

function useFetch(t, implementation = async () => new Response(artifactBytes)) {
  return t.mock.method(globalThis, "fetch", implementation);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("signed registries accept generic app/adapter identities and complete semantic versions", async () => {
  const descriptor = release();
  const approved = await verifyReleaseRegistry(signed([descriptor]), trustedKeys);
  assert.deepEqual(approved, [descriptor]);
  assert.equal(Object.isFrozen(approved), true);
  assert.equal(Object.isFrozen(approved[0]), true);
  assert.throws(() => { approved[0].artifactSha256 = "0".repeat(64); }, TypeError);
  for (const version of ["0.0.0", "10.25.100", "1.0.0-rc.0", "1.0.0-01a+001"]) {
    assert.equal((await verifyReleaseRegistry(signed([release({ version })]), trustedKeys))[0].version, version);
  }
});

test("registries reject unsigned, untrusted, forged and tampered payloads", async () => {
  const unsigned = signed();
  unsigned.signature = "";
  await assert.rejects(verifyReleaseRegistry(unsigned, trustedKeys), /unsigned/);
  delete unsigned.signature;
  await assert.rejects(verifyReleaseRegistry(unsigned, trustedKeys), /missing/);
  await assert.rejects(verifyReleaseRegistry(signed(), []), /not trusted/);
  const other = generateKeyPairSync("ed25519");
  const forged = signed();
  forged.signature = sign(null, Buffer.from(JSON.stringify(forged.payload)), other.privateKey).toString("base64");
  await assert.rejects(verifyReleaseRegistry(forged, trustedKeys), /signature verification failed/);
  const tampered = signed();
  tampered.payload.releases[0].version = "3.0.0";
  await assert.rejects(verifyReleaseRegistry(tampered, trustedKeys), /signature verification failed/);
});

test("registry verification snapshots payload and trusted keys before asynchronous crypto", async () => {
  const document = signed();
  const keys = structuredClone(trustedKeys);
  const pending = verifyReleaseRegistry(document, keys);
  document.payload.releases[0].artifactSha256 = "0".repeat(64);
  document.payload.releases[0].appId = "malicious-replacement";
  keys[0].publicKeyBase64 = "invalid";
  const approved = await pending;
  assert.equal(approved[0].artifactSha256, hash(artifactBytes));
  assert.equal(approved[0].appId, "org.example.ControlPanel");
});

test("registry envelope, payload, keys and encoding fail closed on malformed data", async () => {
  const invalidDocuments = [null, false, [], {}, { ...signed(), schemaVersion: 2 }, { ...signed(), algorithm: "RSA" },
    { ...signed(), keyId: "" }, { ...signed(), extra: true }, { ...signed(), payload: null },
    { ...signed(), payload: { releases: [] } }, { ...signed(), payload: { releases: "invalid" } },
    { ...signed(), payload: { releases: [release()], extra: true } },
    { ...signed(), signature: "A".repeat(88) }, { ...signed(), signature: " ".repeat(88) },
    signed(new Array(1)), signed([null]), signed([[]])];
  for (const document of invalidDocuments) await assert.rejects(verifyReleaseRegistry(document, trustedKeys));
  const invalidKeys = [null, {}, [null], [{ ...trustedKeys[0], algorithm: "RSA" }],
    [trustedKeys[0], trustedKeys[0]], [{ ...trustedKeys[0], publicKeyBase64: "a".repeat(44) }],
    [{ ...trustedKeys[0], publicKeyBase64: trustedKeys[0].publicKeyBase64 + "\n" }],
    [{ ...trustedKeys[0], extra: true }]];
  for (const keys of invalidKeys) await assert.rejects(verifyReleaseRegistry(signed(), keys));
  const noncanonical = signed();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const last = noncanonical.signature.length - 3;
  noncanonical.signature = noncanonical.signature.slice(0, last)
    + alphabet[alphabet.indexOf(noncanonical.signature[last]) + 1] + "==";
  await assert.rejects(verifyReleaseRegistry(noncanonical, trustedKeys), /canonical base64/);
});

test("all release fields are mandatory and malformed descriptors are rejected even when signed", async () => {
  for (const key of Object.keys(release())) {
    const descriptor = release();
    delete descriptor[key];
    await assert.rejects(verifyReleaseRegistry(signed([descriptor]), trustedKeys), /missing/);
  }
  const invalid = [
    { appId: "../invalid" }, { appId: 4 }, { appId: "x".repeat(129) }, { adapterId: "" },
    { version: "01.0.0" }, { version: "1.0" }, { version: "1.0.0-01" }, { version: "1.0.0+" },
    { version: "1.0.0\n" }, { adapterVersion: null }, { adapterVersion: "latest" },
    { sourceCommit: "A".repeat(40) }, { sourceCommit: "a".repeat(39) },
    { packageFile: "" }, { packageFile: " bad.bundle" }, { artifactFile: "bad\n.wasm" },
    { artifactFile: "javascript:alert(1)" }, { artifactFile: "file:///private.wasm" },
    { artifactFile: "https://user:password@example.test/private.wasm" },
    { packageSha256: "b".repeat(63) }, { artifactSha256: "G".repeat(64) },
    { capsuleAbi: 0 }, { capsuleAbi: -1 }, { capsuleAbi: 1.5 }, { capsuleAbi: "1" },
    { capsuleAbi: Number.MAX_SAFE_INTEGER + 1 }, { capsuleAbi: NaN },
    { executionMode: "native" }, { unexpected: true },
  ];
  for (const values of invalid) await assert.rejects(verifyReleaseRegistry(signed([release(values)]), trustedKeys));
});

test("duplicate package hashes cannot ambiguously select different releases", async () => {
  await assert.rejects(verifyReleaseRegistry(signed([release(), release({ appId: "org.example.Other", version: "9.0.0" })]), trustedKeys), /duplicate package/);
  const approved = await verifyReleaseRegistry(signed([release(), release({ packageSha256: "0".repeat(64), version: "3.0.0" })]), trustedKeys);
  assert.equal(approved.length, 2);
});

test("registry entry counts and signed payload sizes are bounded", async () => {
  await assert.rejects(verifyReleaseRegistry(signed(Array.from({ length: 1025 }, () => release())), trustedKeys), /1 to 1024/);
  const large = Array.from({ length: 600 }, (_, index) => release({
    packageSha256: index.toString(16).padStart(64, "0"),
    packageFile: "p".repeat(2048),
    artifactFile: "a".repeat(2048),
  }));
  await assert.rejects(verifyReleaseRegistry(signed(large), trustedKeys), /payload exceeds the size limit/);
});

test("a gate only accepts the exact cryptographically verified immutable list", async () => {
  const approved = await verifyReleaseRegistry(signed(), trustedKeys);
  for (const releases of [[release()], [...approved], structuredClone(approved), [], null]) {
    assert.throws(() => new ApplicationGate({ releases, maximumBytes: 100 }), /verified, signed release registry/);
  }
  assert.doesNotThrow(() => new ApplicationGate({ releases: approved, maximumBytes: 100 }));
  for (const limit of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new ApplicationGate({ releases: approved, maximumBytes: limit }), /positive safe integers/);
    assert.throws(() => new ApplicationGate({ releases: approved, maximumBytes: 100, maximumArtifactBytes: limit }), /positive safe integers/);
  }
});

test("a gate binds package and artifact hashes, resolves the registry URL and never executes", async (t) => {
  const calls = useFetch(t);
  const instantiate = t.mock.method(WebAssembly, "instantiate", () => { throw new Error("must not execute"); });
  const compile = t.mock.method(WebAssembly, "compile", () => { throw new Error("must not execute"); });
  const states = [];
  const subject = await gate({ onState: (state) => states.push(state) });
  const result = await subject.verify(packageBlob());
  assert.equal(result.verification.accepted, true);
  assert.equal(result.verification.packageSha256, hash(packageBytes));
  assert.equal(result.verification.fileName, "user-renamed.package");
  assert.deepEqual(result.artifactBytes, artifactBytes);
  assert.equal(subject.state, "READY");
  assert.equal(calls.mock.calls[0].arguments[0].href, "https://example.test/releases/panel.wasm");
  assert.equal(calls.mock.calls[0].arguments[1].credentials, "omit");
  assert.equal(calls.mock.calls[0].arguments[1].redirect, "error");
  assert.equal(instantiate.mock.callCount(), 0);
  assert.equal(compile.mock.callCount(), 0);
  assert.equal(states[0], "HASHING");
  assert.deepEqual(states.slice(-2), ["LOADING_ARTIFACT", "READY"]);
  result.verification.release.appId = "changed";
  const copy = subject.verification;
  copy.accepted = false;
  assert.equal(subject.verification.accepted, true);
  assert.equal(subject.verification.release.appId, "org.example.ControlPanel");
});

test("a renamed package is accepted by hash, while a same-named wrong package is rejected", async (t) => {
  const fetchMock = useFetch(t);
  const subject = await gate();
  await subject.verify(packageBlob());
  await assert.rejects(subject.verify(packageBlob("different", "panel.bundle")), /not in the trusted/);
  assert.equal(subject.state, "REJECTED");
  assert.equal(subject.verification.accepted, false);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("invalid or oversized package attempts revoke stale acceptance before hashing or fetching", async (t) => {
  const fetchMock = useFetch(t);
  const subject = await gate({ maximumBytes: packageBytes.length });
  await subject.verify(packageBlob());
  for (const input of [null, {}, packageBlob(""), packageBlob(new Uint8Array(packageBytes.length + 1))]) {
    const pending = subject.verify(input);
    assert.notEqual(subject.verification?.accepted, true);
    await assert.rejects(pending);
    assert.equal(subject.state, "REJECTED");
    assert.equal(subject.verification.accepted, false);
    assert.equal(subject.verification.packageSha256, "");
  }
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("an input property failure clears previous verification", async (t) => {
  useFetch(t);
  const subject = await gate();
  await subject.verify(packageBlob());
  const input = new Blob([packageBytes]);
  Object.defineProperty(input, "name", { get() { throw new Error("name unavailable"); } });
  await assert.rejects(subject.verify(input), /name unavailable/);
  assert.equal(subject.verification.accepted, false);
  assert.equal(subject.state, "REJECTED");
});

test("an input cannot substitute different bytes by overriding its stream", async (t) => {
  const fetchMock = useFetch(t);
  const input = packageBlob("unapproved original bytes");
  input.stream = () => new Blob([packageBytes]).stream();
  await assert.rejects((await gate()).verify(input), /not in the trusted/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("fetch failures, HTTP errors, stream errors and mismatched artifacts fail closed", async (t) => {
  let response = () => new Response(artifactBytes);
  useFetch(t, async () => response());
  const subject = await gate();
  const failures = [
    () => { throw new Error("network failure"); },
    () => new Response("missing", { status: 404 }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("broken stream")); } })),
    () => new Response("tampered artifact"),
    () => new Response(),
  ];
  for (const failure of failures) {
    response = () => new Response(artifactBytes);
    await subject.verify(packageBlob());
    response = failure;
    await assert.rejects(subject.verify(packageBlob()));
    assert.equal(subject.state, "REJECTED");
    assert.equal(subject.verification.accepted, false);
  }
});

test("artifact size limits bound headers and actual streamed bytes, including misleading lengths", async (t) => {
  let response;
  useFetch(t, async () => response);
  const subject = await gate({ maximumArtifactBytes: artifactBytes.length });
  for (const headers of [{ "content-length": String(artifactBytes.length + 1) }, { "content-length": "invalid" }, { "content-length": "9007199254740992" }]) {
    response = new Response(artifactBytes, { headers });
    await assert.rejects(subject.verify(packageBlob()), /size limit|content length/);
    assert.equal(subject.verification.accepted, false);
  }
  let canceled = false;
  response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(artifactBytes); controller.enqueue(new Uint8Array([0])); },
    cancel() { canceled = true; },
  }), { headers: { "content-length": "1" } });
  await assert.rejects(subject.verify(packageBlob()), /size limit/);
  assert.equal(canceled, true);
  assert.equal(subject.verification.accepted, false);
  response = new Response(artifactBytes, { headers: { "content-length": String(artifactBytes.length) } });
  assert.equal((await subject.verify(packageBlob())).verification.accepted, true);
});

test("artifact size limit defaults to the package limit", async (t) => {
  useFetch(t);
  const subject = await gate({ maximumBytes: packageBytes.length, maximumArtifactBytes: undefined });
  await assert.rejects(subject.verify(packageBlob()), /size limit/);
  assert.equal(subject.verification.accepted, false);
});

test("unresolvable artifact URLs clear any verification and never fetch", async (t) => {
  const fetchMock = useFetch(t);
  const subject = await gate({ registryBaseUrl: undefined });
  await assert.rejects(subject.verify(packageBlob()), /resolvable/);
  assert.equal(subject.verification.accepted, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("a new pending attempt immediately clears the previous accepted result", async (t) => {
  const reachedFetch = deferred();
  const delayedResponse = deferred();
  let pending = false;
  useFetch(t, async () => {
    if (!pending) return new Response(artifactBytes);
    reachedFetch.resolve();
    return delayedResponse.promise;
  });
  const subject = await gate();
  await subject.verify(packageBlob());
  pending = true;
  const verification = subject.verify(packageBlob());
  assert.equal(subject.verification, undefined);
  await reachedFetch.promise;
  assert.equal(subject.state, "LOADING_ARTIFACT");
  assert.equal(subject.verification, undefined);
  delayedResponse.resolve(new Response(artifactBytes));
  await verification;
  assert.equal(subject.verification.accepted, true);
});

test("a superseded success cannot overwrite a newer rejected attempt", async (t) => {
  const reachedFetch = deferred();
  const delayedResponse = deferred();
  let oldSignal;
  useFetch(t, async (_url, options) => {
    oldSignal = options.signal;
    reachedFetch.resolve();
    return delayedResponse.promise;
  });
  const subject = await gate();
  const old = subject.verify(packageBlob());
  const oldRejection = assert.rejects(old, /superseded/);
  await reachedFetch.promise;
  await assert.rejects(subject.verify(packageBlob("wrong")), /trusted release registry/);
  assert.equal(oldSignal.aborted, true);
  delayedResponse.resolve(new Response(artifactBytes));
  await oldRejection;
  assert.equal(subject.state, "REJECTED");
  assert.equal(subject.verification.accepted, false);
  assert.equal(subject.verification.packageSha256, hash("wrong"));
});

test("a superseded failure cannot overwrite a newer successful attempt", async (t) => {
  const reachedFetch = deferred();
  const delayedResponse = deferred();
  let count = 0;
  useFetch(t, async () => {
    if (++count > 1) return new Response(artifactBytes);
    reachedFetch.resolve();
    return delayedResponse.promise;
  });
  const subject = await gate();
  const old = subject.verify(packageBlob());
  const oldRejection = assert.rejects(old, /old failure/);
  await reachedFetch.promise;
  await subject.verify(packageBlob());
  delayedResponse.reject(new Error("old failure"));
  await oldRejection;
  assert.equal(subject.state, "READY");
  assert.equal(subject.verification.accepted, true);
});

test("reset revokes acceptance and blocks a pending verification from restoring it", async (t) => {
  const reachedFetch = deferred();
  const delayedResponse = deferred();
  useFetch(t, async () => { reachedFetch.resolve(); return delayedResponse.promise; });
  const subject = await gate();
  const pending = subject.verify(packageBlob());
  const rejected = assert.rejects(pending, /superseded or reset/);
  await reachedFetch.promise;
  subject.reset();
  assert.equal(subject.state, "EMPTY");
  assert.equal(subject.verification, undefined);
  delayedResponse.resolve(new Response(artifactBytes));
  await rejected;
  assert.equal(subject.state, "EMPTY");
  assert.equal(subject.verification, undefined);
});

test("a failing state callback cannot leave accepted verification after a rejected attempt", async (t) => {
  useFetch(t);
  const subject = await gate({ onState(state) { if (state === "READY") throw new Error("observer failure"); } });
  await assert.rejects(subject.verify(packageBlob()), /observer failure/);
  assert.equal(subject.state, "REJECTED");
  assert.equal(subject.verification.accepted, false);
});

test("registry loading verifies an in-memory document or bounded credential-free HTTP response", async (t) => {
  const document = signed();
  const inMemory = await loadReleaseRegistry(document, trustedKeys);
  assert.equal(inMemory.baseUrl, undefined);
  assert.doesNotThrow(() => new ApplicationGate({ releases: inMemory.releases, maximumBytes: 100 }));
  const fetchMock = useFetch(t, async () => new Response(JSON.stringify(document)));
  const result = await loadReleaseRegistry("https://example.test/releases/registry.json", trustedKeys);
  assert.equal(result.baseUrl.href, "https://example.test/releases/registry.json");
  assert.deepEqual(result.releases, document.payload.releases);
  assert.equal(fetchMock.mock.calls[0].arguments[1].credentials, "omit");
  assert.equal(fetchMock.mock.calls[0].arguments[1].redirect, "error");
  const missing = await loadReleaseRegistry(undefined, []);
  assert.deepEqual(missing.releases, []);
  assert.throws(() => new ApplicationGate({ releases: missing.releases, maximumBytes: 100 }), /verified, signed/);
});

test("registry loading rejects malformed, unsigned, oversized and unsupported sources", async (t) => {
  let response;
  useFetch(t, async () => response);
  for (const source of ["file:///registry.json", "data:application/json,{}", "https://user:pass@example.test/registry.json"]) {
    await assert.rejects(loadReleaseRegistry(source, trustedKeys), /HTTP\(S\)/);
  }
  for (const value of ["{", JSON.stringify({ ...signed(), signature: "" }), new Uint8Array([0xff])]) {
    response = new Response(value);
    await assert.rejects(loadReleaseRegistry("https://example.test/registry.json", trustedKeys));
  }
  response = new Response("no", { status: 404 });
  await assert.rejects(loadReleaseRegistry("https://example.test/registry.json", trustedKeys), /404/);
  response = new Response("small", { headers: { "content-length": String(1024 * 1024 + 1) } });
  await assert.rejects(loadReleaseRegistry("https://example.test/registry.json", trustedKeys), /size limit/);
  response = new Response(new Uint8Array(1024 * 1024 + 1));
  await assert.rejects(loadReleaseRegistry("https://example.test/registry.json", trustedKeys), /size limit/);
});

test("schema declares the generic mandatory signed release contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../../../schemas/release-registry.schema.json", import.meta.url), "utf8"));
  const descriptor = schema.properties.payload.properties.releases.items;
  assert.deepEqual(new Set(descriptor.required), new Set(Object.keys(release())));
  assert.equal(descriptor.additionalProperties, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.payload.properties.releases.minItems, 1);
  assert.equal(descriptor.properties.capsuleAbi.minimum, 1);
  for (const [key, value] of Object.entries(release())) {
    if (descriptor.properties[key].pattern) assert.match(value, new RegExp(descriptor.properties[key].pattern));
  }
});
