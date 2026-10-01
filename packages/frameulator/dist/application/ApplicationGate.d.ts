import { type ReleaseDescriptor, type VerifiedReleases } from "./ReleaseRegistry";
export type ApplicationGateState = "EMPTY" | "HASHING" | "LOADING_ARTIFACT" | "READY" | "REJECTED";
export type PackageInput = Blob & {
    name?: string;
};
export type PackageVerification = {
    accepted: true;
    fileName: string;
    size: number;
    packageSha256: string;
    release: Readonly<ReleaseDescriptor>;
} | {
    accepted: false;
    fileName: string;
    size: number;
    packageSha256: string;
    reason: string;
};
export interface ApplicationGateOptions {
    /** Use the exact list returned by verifyReleaseRegistry or loadReleaseRegistry. */
    releases: VerifiedReleases;
    registryBaseUrl?: URL;
    maximumBytes: number;
    maximumArtifactBytes?: number;
    onState?(state: ApplicationGateState, detail: string, progress?: number): void;
}
/** Verifies signed byte identity only. This gate never instantiates or executes an artifact. */
export declare class ApplicationGate {
    private currentState;
    private selected?;
    private readonly releases;
    private readonly maximumBytes;
    private readonly maximumArtifactBytes;
    private readonly registryBaseUrl?;
    private readonly onState?;
    private attempt;
    private controller?;
    constructor(options: ApplicationGateOptions);
    get state(): ApplicationGateState;
    get verification(): PackageVerification | undefined;
    verify(input: PackageInput): Promise<{
        verification: Extract<PackageVerification, {
            accepted: true;
        }>;
        artifactBytes: Uint8Array;
    }>;
    reset(): void;
    private assertCurrent;
    private setState;
}
