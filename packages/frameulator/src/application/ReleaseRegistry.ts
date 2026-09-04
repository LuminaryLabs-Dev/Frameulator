import type { AgoraRelease, ReleaseRegistryDocument, TrustedReleaseKey } from "../types";

function decodeBase64(value: string): Uint8Array {
  if (typeof atob === "function") {
    const decoded = atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/=+$/, "");
  const output = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let accumulator = 0;
  let bits = 0;
  let index = 0;
  for (const character of clean) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("Release signature contains invalid base64.");
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = (accumulator >> bits) & 0xff;
    }
  }
  return output;
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function validateRelease(release: AgoraRelease): void {
  if (release.appId !== "dev.luminarylabs.Agora") throw new Error("Release registry contains an unsupported application ID.");
  if (!/^0\.0\.\d+$/.test(release.version)) throw new Error("Release registry contains an unsupported Agora version.");
  if (!["x86_64", "aarch64"].includes(release.architecture)) throw new Error("Release registry contains an unsupported architecture.");
  if (!/^[0-9a-f]{40}$/.test(release.sourceCommit)) throw new Error("Release registry contains an invalid source commit.");
  if (!release.flatpakFile.toLowerCase().endsWith(".flatpak")) throw new Error("Release registry contains an invalid Flatpak filename.");
  if (!/^[0-9a-f]{64}$/.test(release.flatpakSha256)) throw new Error("Release registry contains an invalid Flatpak checksum.");
  if (!/^[0-9a-f]{64}$/.test(release.browserWasmSha256)) throw new Error("Release registry contains an invalid capsule checksum.");
  if (release.executionMode !== "browser-wasm-capsule") throw new Error("Release registry contains an unsupported execution mode.");
  if (!release.browserWasmFile) throw new Error("Release registry does not identify a browser capsule.");
}

export async function verifyReleaseRegistry(
  document: ReleaseRegistryDocument,
  trustedKeys: TrustedReleaseKey[],
): Promise<AgoraRelease[]> {
  if (document.schemaVersion !== 1 || document.algorithm !== "Ed25519") {
    throw new Error("Unsupported Agora release registry format.");
  }
  const trustedKey = trustedKeys.find((key) => key.id === document.keyId && key.algorithm === "Ed25519");
  if (!trustedKey) throw new Error(`Release registry key is not trusted: ${document.keyId}`);
  if (!document.signature) throw new Error("Release registry is unsigned.");
  const key = await crypto.subtle.importKey(
    "raw",
    exactBuffer(decodeBase64(trustedKey.publicKeyBase64)),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    exactBuffer(decodeBase64(document.signature)),
    exactBuffer(new TextEncoder().encode(JSON.stringify(document.payload))),
  );
  if (!valid) throw new Error("Release registry signature verification failed.");
  if (!Array.isArray(document.payload.releases)) throw new Error("Release registry has no release list.");
  if (document.payload.releases.length === 0) throw new Error("Release registry contains no approved releases.");
  document.payload.releases.forEach(validateRelease);
  const unique = new Set(document.payload.releases.map((release) => release.flatpakSha256));
  if (unique.size !== document.payload.releases.length) throw new Error("Release registry contains duplicate Flatpak checksums.");
  return structuredClone(document.payload.releases);
}

export async function loadReleaseRegistry(
  source: ReleaseRegistryDocument | string | URL | undefined,
  trustedKeys: TrustedReleaseKey[],
): Promise<{ releases: AgoraRelease[]; baseUrl?: URL }> {
  if (!source) return { releases: [] };
  if (typeof source !== "string" && !(source instanceof URL)) {
    return { releases: await verifyReleaseRegistry(source, trustedKeys) };
  }
  const url = new URL(String(source), typeof document === "undefined" ? undefined : document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load Agora release registry (${response.status}).`);
  const registry = await response.json() as ReleaseRegistryDocument;
  return { releases: await verifyReleaseRegistry(registry, trustedKeys), baseUrl: url };
}
