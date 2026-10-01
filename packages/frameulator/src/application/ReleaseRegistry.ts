/** A signed package-to-browser-artifact binding. Verification does not execute either file. */
export interface ReleaseDescriptor {
  appId: string;
  version: string;
  sourceCommit: string;
  adapterId: string;
  adapterVersion: string;
  packageFile: string;
  packageSha256: string;
  artifactFile: string;
  artifactSha256: string;
  executionMode: "browser-wasm-capsule";
  capsuleAbi: number;
}

export interface ReleaseRegistryDocument {
  schemaVersion: 1;
  algorithm: "Ed25519";
  keyId: string;
  payload: { releases: ReleaseDescriptor[] };
  /** Ed25519 signature over the exact UTF-8 bytes of JSON.stringify(payload). */
  signature: string;
}

export interface TrustedReleaseKey {
  id: string;
  algorithm: "Ed25519";
  /** Standard, padded base64 encoding of a 32-byte raw Ed25519 public key. */
  publicKeyBase64: string;
}

export type VerifiedReleases = readonly Readonly<ReleaseDescriptor>[];

const MAX_REGISTRY_BYTES = 1024 * 1024;
const MAX_RELEASES = 1024;
const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const checksum = /^[0-9a-f]{64}$/;
const approvedLists = new WeakSet<VerifiedReleases>();
const releaseFields = [
  "appId", "version", "sourceCommit", "adapterId", "adapterVersion", "packageFile", "packageSha256",
  "artifactFile", "artifactSha256", "executionMode", "capsuleAbi",
];

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  if (Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new Error(`${label} has missing or unsupported fields.`);
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifier.test(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && semver.test(value);
}

function isFile(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048
    && value === value.trim() && !/[\u0000-\u001f\u007f\\]/.test(value);
}

/** Restrict fetched registry/artifact locations to ordinary HTTP(S) resources. */
export function resolveReleaseUrl(file: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(file, base ?? (typeof document === "undefined" ? undefined : document.baseURI));
  } catch {
    throw new Error("The release location is not a resolvable HTTP(S) URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("The release location must be an HTTP(S) URL without credentials.");
  }
  return url;
}

function validateRelease(value: unknown): asserts value is ReleaseDescriptor {
  const release = record(value, "Release descriptor");
  exactFields(release, releaseFields, "Release descriptor");
  if (!isIdentifier(release.appId)) throw new Error("Release registry contains an invalid application ID.");
  if (!isIdentifier(release.adapterId)) throw new Error("Release registry contains an invalid adapter ID.");
  if (!isVersion(release.version) || !isVersion(release.adapterVersion)) {
    throw new Error("Release registry contains an invalid semantic version.");
  }
  if (typeof release.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(release.sourceCommit)) {
    throw new Error("Release registry contains an invalid source commit.");
  }
  if (!isFile(release.packageFile) || !isFile(release.artifactFile)) {
    throw new Error("Release registry contains an invalid package or artifact file.");
  }
  // A base is needed only to validate relative references here, not to choose their fetch origin.
  resolveReleaseUrl(release.artifactFile, new URL("https://registry.invalid/"));
  if (typeof release.packageSha256 !== "string" || !checksum.test(release.packageSha256)) {
    throw new Error("Release registry contains an invalid package checksum.");
  }
  if (typeof release.artifactSha256 !== "string" || !checksum.test(release.artifactSha256)) {
    throw new Error("Release registry contains an invalid artifact checksum.");
  }
  if (release.executionMode !== "browser-wasm-capsule") throw new Error("Release registry contains an unsupported execution mode.");
  if (!Number.isSafeInteger(release.capsuleAbi) || (release.capsuleAbi as number) <= 0) {
    throw new Error("Release registry contains an invalid capsule ABI.");
  }
}

function decodeBase64(value: unknown, expectedBytes: number, label: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (typeof value !== "string" || value.length !== 4 * Math.ceil(expectedBytes / 3)
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} must be canonical base64 for ${expectedBytes} bytes.`);
  }
  const clean = value.replace(/=+$/, "");
  if ((value.endsWith("==") && (alphabet.indexOf(clean.at(-1)!) & 15) !== 0)
    || (value.endsWith("=") && !value.endsWith("==") && (alphabet.indexOf(clean.at(-1)!) & 3) !== 0)) {
    throw new Error(`${label} must be canonical base64.`);
  }
  const output = new Uint8Array(Math.floor(clean.length * 6 / 8));
  let accumulator = 0;
  let bits = 0;
  let index = 0;
  for (const character of clean) {
    accumulator = (accumulator << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = (accumulator >> bits) & 0xff;
    }
  }
  if (output.byteLength !== expectedBytes) throw new Error(`${label} has an invalid length.`);
  return output;
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Fail closed unless this exact immutable list was returned by signature verification. */
export function requireVerifiedReleases(releases: VerifiedReleases): VerifiedReleases {
  if (!approvedLists.has(releases)) throw new Error("Application gate requires a verified, signed release registry.");
  return releases;
}

export async function verifyReleaseRegistry(
  document: unknown,
  trustedKeys: readonly TrustedReleaseKey[],
): Promise<VerifiedReleases> {
  // Snapshot before the first await so caller mutation cannot change what gets approved.
  let snapshot: unknown;
  let keys: readonly TrustedReleaseKey[];
  try {
    snapshot = structuredClone(document);
    keys = structuredClone(trustedKeys);
  } catch {
    throw new Error("Release registry and trusted keys must contain serializable data.");
  }
  const registry = record(snapshot, "Release registry");
  exactFields(registry, ["schemaVersion", "algorithm", "keyId", "payload", "signature"], "Release registry");
  if (registry.schemaVersion !== 1 || registry.algorithm !== "Ed25519") throw new Error("Unsupported release registry format.");
  if (!isIdentifier(registry.keyId)) throw new Error("Release registry contains an invalid signing key ID.");
  if (!registry.signature) throw new Error("Release registry is unsigned.");
  const signature = decodeBase64(registry.signature, 64, "Release signature");
  const payload = record(registry.payload, "Release payload");
  exactFields(payload, ["releases"], "Release payload");
  if (!Array.isArray(payload.releases) || payload.releases.length === 0 || payload.releases.length > MAX_RELEASES) {
    throw new Error(`Release registry must contain 1 to ${MAX_RELEASES} approved releases.`);
  }
  for (const release of payload.releases) validateRelease(release);
  const releases = payload.releases as ReleaseDescriptor[];
  if (new Set(releases.map((release) => release.packageSha256)).size !== releases.length) {
    throw new Error("Release registry contains duplicate package checksums.");
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (payloadBytes.byteLength > MAX_REGISTRY_BYTES) throw new Error("Release registry payload exceeds the size limit.");
  if (!Array.isArray(keys)) throw new Error("Trusted release keys must be a list.");
  const keyIds = new Set<string>();
  for (const candidate of keys) {
    const trusted = record(candidate, "Trusted release key");
    exactFields(trusted, ["id", "algorithm", "publicKeyBase64"], "Trusted release key");
    if (!isIdentifier(trusted.id) || trusted.algorithm !== "Ed25519" || keyIds.has(trusted.id)) {
      throw new Error("Trusted release keys contain an invalid or duplicate key ID or algorithm.");
    }
    keyIds.add(trusted.id);
    decodeBase64(trusted.publicKeyBase64, 32, "Trusted public key");
  }
  const trustedKey = keys.find((candidate) => candidate.id === registry.keyId);
  if (!trustedKey) throw new Error(`Release registry key is not trusted: ${registry.keyId}`);
  const key = await crypto.subtle.importKey("raw", exactBuffer(decodeBase64(trustedKey.publicKeyBase64, 32, "Trusted public key")),
    { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, key, exactBuffer(signature), exactBuffer(payloadBytes));
  if (!valid) throw new Error("Release registry signature verification failed.");
  releases.forEach(Object.freeze);
  const approved: VerifiedReleases = Object.freeze(releases);
  approvedLists.add(approved);
  return approved;
}

/** Bound actual streamed bytes as well as the optional server-declared length. */
export async function readBoundedResponse(response: Response, maximumBytes: number, label: string): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && (!/^(0|[1-9]\d*)$/.test(declaredLength)
    || !Number.isSafeInteger(Number(declaredLength)) || Number(declaredLength) > maximumBytes)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`${label} exceeds the size limit or has an invalid content length.`);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maximumBytes) throw new Error(`${label} exceeds the size limit.`);
      chunks.push(value.slice());
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function loadReleaseRegistry(
  source: ReleaseRegistryDocument | string | URL | undefined,
  trustedKeys: readonly TrustedReleaseKey[],
): Promise<{ releases: VerifiedReleases; baseUrl?: URL }> {
  // No configured registry grants no permission; the empty list has no verified provenance.
  if (source === undefined) return { releases: Object.freeze([]) };
  if (typeof source !== "string" && !(source instanceof URL)) return { releases: await verifyReleaseRegistry(source, trustedKeys) };
  const url = resolveReleaseUrl(String(source));
  const response = await fetch(url, { credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`Unable to load release registry (${response.status}).`);
  const bytes = await readBoundedResponse(response, MAX_REGISTRY_BYTES, "Release registry");
  let registry: unknown;
  try {
    registry = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Release registry is not valid UTF-8 JSON.");
  }
  return { releases: await verifyReleaseRegistry(registry, trustedKeys), baseUrl: url };
}
