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
    payload: {
        releases: ReleaseDescriptor[];
    };
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
/** Restrict fetched registry/artifact locations to ordinary HTTP(S) resources. */
export declare function resolveReleaseUrl(file: string, base?: URL): URL;
/** Fail closed unless this exact immutable list was returned by signature verification. */
export declare function requireVerifiedReleases(releases: VerifiedReleases): VerifiedReleases;
export declare function verifyReleaseRegistry(document: unknown, trustedKeys: readonly TrustedReleaseKey[]): Promise<VerifiedReleases>;
/** Bound actual streamed bytes as well as the optional server-declared length. */
export declare function readBoundedResponse(response: Response, maximumBytes: number, label: string): Promise<Uint8Array>;
export declare function loadReleaseRegistry(source: ReleaseRegistryDocument | string | URL | undefined, trustedKeys: readonly TrustedReleaseKey[]): Promise<{
    releases: VerifiedReleases;
    baseUrl?: URL;
}>;
