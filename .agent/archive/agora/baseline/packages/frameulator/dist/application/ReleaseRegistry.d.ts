import type { AgoraRelease, ReleaseRegistryDocument, TrustedReleaseKey } from "../types";
export declare function verifyReleaseRegistry(document: ReleaseRegistryDocument, trustedKeys: TrustedReleaseKey[]): Promise<AgoraRelease[]>;
export declare function loadReleaseRegistry(source: ReleaseRegistryDocument | string | URL | undefined, trustedKeys: TrustedReleaseKey[]): Promise<{
    releases: AgoraRelease[];
    baseUrl?: URL;
}>;
