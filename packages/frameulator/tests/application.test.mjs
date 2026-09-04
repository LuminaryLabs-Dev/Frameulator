import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Frameulator, IncrementalSha256, sha256Blob, verifyReleaseRegistry } from "../dist/frameulator.js";

const wasmBytes = await readFile(new URL("../dist/frameulator.wasm", import.meta.url));
const capsuleBytes = await readFile(new URL("./fixtures/agora-test-capsule.wasm", import.meta.url));

function flatpak(bytes, name = "Agora-0.0.2-x86_64.flatpak") {
  const blob = new Blob([bytes], { type: "application/vnd.flatpak" });
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

test("incremental SHA-256 matches standard vectors and streamed blobs", async () => {
  assert.equal(
    new IncrementalSha256().update(new TextEncoder().encode("abc")).digestHex(),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  const content = new TextEncoder().encode("Agora Flatpak local verification");
  const expected = "7774daa6dc84c4867ee3acdf7a89c34a07f74b6345ddf3d18806274944f4f8f2";
  assert.equal(await sha256Blob(new Blob([content])), expected);
  const large = new Uint8Array(1024 * 1024 + 17).map((_, index) => index % 251);
  const incremental = new IncrementalSha256();
  for (let offset = 0; offset < large.length; offset += 8191) incremental.update(large.subarray(offset, offset + 8191));
  assert.equal(incremental.digestHex(), createHash("sha256").update(large).digest("hex"));
});

test("sessions are rejected until an approved Flatpak is verified", async () => {
  const lab = await Frameulator.create({ wasmBytes, worker: false, renderer: "none", storage: "memory" });
  assert.equal(lab.applicationState, "EMPTY");
  await assert.rejects(lab.start(), /FLATPAK_REQUIRED/);
  await assert.rejects(lab.runScenario("normal-session"), /FLATPAK_REQUIRED/);
  const unapproved = flatpak("unapproved");
  await assert.rejects(lab.selectFlatpak(unapproved), /trusted Agora release registry/);
  assert.equal(lab.applicationState, "REJECTED");
  assert.equal(lab.flatpakVerification.accepted, false);
  assert.equal(lab.flatpakVerification.fileName, "Agora-0.0.2-x86_64.flatpak");
  assert.equal(lab.flatpakVerification.size, unapproved.size);
  await lab.removeApplication();
  assert.equal(lab.applicationState, "EMPTY");
  await lab.destroy();
});

test("the Flatpak size ceiling is enforced before hashing", async () => {
  const lab = await Frameulator.create({
    wasmBytes,
    worker: false,
    renderer: "none",
    storage: "memory",
    maximumFlatpakBytes: 1024 * 1024,
  });
  const oversized = flatpak(new Uint8Array(1024 * 1024 + 1));
  await assert.rejects(lab.selectFlatpak(oversized), /exceeds the 1 MB limit/);
  assert.equal(lab.flatpakVerification.flatpakSha256, "");
  assert.equal(lab.flatpakVerification.size, oversized.size);
  await lab.destroy();
});

test("release registries require a valid Ed25519 signature", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const release = {
    appId: "dev.luminarylabs.Agora",
    version: "0.0.2",
    capsuleAbi: 2,
    managementProtocol: "agora-management/2",
    sourceCommit: "a".repeat(40),
    architecture: "x86_64",
    flatpakFile: "Agora-0.0.2-x86_64.flatpak",
    flatpakSha256: "b".repeat(64),
    browserWasmFile: "agora-0.0.2-browser.wasm",
    browserWasmSha256: "c".repeat(64),
    executionMode: "browser-wasm-capsule",
  };
  const payload = { releases: [release] };
  const rawPublicKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  const registry = {
    schemaVersion: 1,
    algorithm: "Ed25519",
    keyId: "test-key",
    payload,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString("base64"),
  };
  const keys = [{ id: "test-key", algorithm: "Ed25519", publicKeyBase64: rawPublicKey }];
  assert.deepEqual(await verifyReleaseRegistry(registry, keys), [release]);
  registry.payload.releases[0].version = "0.0.3";
  await assert.rejects(verifyReleaseRegistry(registry, keys), /signature verification failed/);
});

test("an exact approved Flatpak loads its matched capsule and emits bounded evidence", async () => {
  const flatpakBytes = new TextEncoder().encode("deterministic Agora test Flatpak");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const release = {
    appId: "dev.luminarylabs.Agora",
    version: "0.0.2",
    capsuleAbi: 2,
    managementProtocol: "agora-management/2",
    sourceCommit: "d".repeat(40),
    architecture: "x86_64",
    flatpakFile: "Agora-0.0.2-x86_64.flatpak",
    flatpakSha256: createHash("sha256").update(flatpakBytes).digest("hex"),
    browserWasmFile: `data:application/wasm;base64,${capsuleBytes.toString("base64")}`,
    browserWasmSha256: createHash("sha256").update(capsuleBytes).digest("hex"),
    executionMode: "browser-wasm-capsule",
  };
  const payload = { releases: [release] };
  const registry = {
    schemaVersion: 1,
    algorithm: "Ed25519",
    keyId: "integration-key",
    payload,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString("base64"),
  };
  const trustedReleaseKeys = [{
    id: "integration-key",
    algorithm: "Ed25519",
    publicKeyBase64: publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"),
  }];
  const lab = await Frameulator.create({
    wasmBytes,
    worker: false,
    renderer: "none",
    storage: "memory",
    releaseRegistry: registry,
    trustedReleaseKeys,
  });
  const verification = await lab.selectFlatpak(flatpak(flatpakBytes));
  assert.equal(verification.accepted, true);
  assert.equal(lab.applicationState, "READY");
  const report = await lab.runScenario("normal-session");
  assert.equal(report.passed, true);
  assert.equal(report.application.flatpakHashVerified, true);
  assert.equal(report.application.matchingAgoraCodeExecuted, true);
  assert.equal(report.application.nativeFlatpakInstalled, false);
  assert.equal(report.application.nativeFlatpakExecuted, false);
  assert.equal(report.application.executionMode, "browser-wasm-capsule");
  assert.equal(report.application.capsuleAbi, 2);
  assert.equal(report.management.snapshot.deploymentState, "DEPLOYED");
  assert.equal(report.management.snapshot.applicationSessionState, "RUNNING");
  assert.equal(report.management.snapshot.testState, "PASSED");
  assert.equal(report.management.snapshot.events.length, report.management.snapshot.eventCount);
  await lab.removeApplication();
  assert.equal(await lab.latestReport(), undefined);
  await lab.destroy();
});

test("management actions enforce deploy, launch, crash, recovery, update, and rollback", async () => {
  const flatpakBytes = new TextEncoder().encode("deterministic Agora management Flatpak");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const release = {
    appId: "dev.luminarylabs.Agora",
    version: "0.0.2",
    capsuleAbi: 2,
    managementProtocol: "agora-management/2",
    sourceCommit: "e".repeat(40),
    architecture: "x86_64",
    flatpakFile: "Agora-0.0.2-x86_64.flatpak",
    flatpakSha256: createHash("sha256").update(flatpakBytes).digest("hex"),
    browserWasmFile: `data:application/wasm;base64,${capsuleBytes.toString("base64")}`,
    browserWasmSha256: createHash("sha256").update(capsuleBytes).digest("hex"),
    executionMode: "browser-wasm-capsule",
  };
  const payload = { releases: [release] };
  const registry = {
    schemaVersion: 1,
    algorithm: "Ed25519",
    keyId: "management-key",
    payload,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString("base64"),
  };
  const lab = await Frameulator.create({
    wasmBytes,
    worker: false,
    renderer: "none",
    storage: "memory",
    releaseRegistry: registry,
    trustedReleaseKeys: [{
      id: "management-key",
      algorithm: "Ed25519",
      publicKeyBase64: publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"),
    }],
  });
  await lab.selectFlatpak(flatpak(flatpakBytes, "Agora-0.0.2-x86_64.flatpak"));
  await assert.rejects(lab.start(), /DEPLOYMENT_REQUIRED/);
  assert.equal((await lab.rehearseDeploy()).deploymentState, "DEPLOYED");
  await lab.start();
  assert.equal((await lab.simulateCrash()).applicationSessionState, "CRASHED");
  assert.equal((await lab.recoverCrash()).applicationSessionState, "IDLE");
  await lab.start();
  await lab.stop();
  assert.equal((await lab.simulateUpdate(2)).currentRelease, 2);
  assert.equal((await lab.simulateRollback()).currentRelease, 1);
  const recovery = await lab.runManagementScenario("crash-recovery");
  assert.equal(recovery.applicationSessionState, "RUNNING");
  assert.equal(recovery.lastEvent, "SESSION_RUNNING");
  await lab.removeApplication();
  assert.equal(lab.applicationState, "EMPTY");
  await lab.destroy();
});
