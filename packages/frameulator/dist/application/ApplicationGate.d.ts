import type { AgoraRelease, ApplicationState, FlatpakInput, FlatpakVerification } from "../types";
export interface ApplicationGateOptions {
    releases: AgoraRelease[];
    registryBaseUrl?: URL;
    maximumBytes: number;
    onState(state: ApplicationState, detail: string, progress?: number): void;
}
export declare class ApplicationGate {
    private readonly options;
    private currentState;
    private selected?;
    constructor(options: ApplicationGateOptions);
    get state(): ApplicationState;
    get verification(): FlatpakVerification | undefined;
    verify(input: FlatpakInput): Promise<{
        verification: FlatpakVerification;
        capsuleBytes: Uint8Array;
    }>;
    markRunning(): void;
    markStopped(): void;
    markFailed(message: string): void;
    reset(): void;
    private resolveCapsuleUrl;
    private reject;
    private setState;
}
