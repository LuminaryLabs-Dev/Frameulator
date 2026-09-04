export type SessionState = "IDLE" | "READY" | "SYNCHRONIZED" | "VISIBLE" | "FOCUSED" | "STOPPING" | "LOSS_PENDING" | "EXITING";
export type ServiceName = "hardware" | "gpu" | "vulkan" | "openxr" | "compositor" | "firmware" | "tracking" | "controllers" | "host";
export interface Pose {
    position: [number, number, number];
    orientation: [number, number, number, number];
}
export interface ControllerState {
    pose?: Pose;
    trigger?: number;
    squeeze?: number;
    thumbstick?: [number, number];
    buttons?: Record<string, boolean>;
}
export interface FrameulatorProfile {
    id: string;
    label: string;
    version: string;
    simulated: true;
    evidenceLevel: "F1-browser-wasm";
    display: {
        eyeWidth: number;
        eyeHeight: number;
        refreshRatesHz: number[];
        defaultRefreshRateHz: number;
    };
    hardware: {
        architecture: "aarch64";
        memoryMiB: number;
    };
    gpu: {
        vendor: string;
        family: string;
        driver: string;
        api: string;
    };
    openxr: {
        apiVersion: string;
        runtime: string;
        viewConfiguration: "PRIMARY_STEREO";
    };
}
export type ScenarioStep = {
    action: "start";
} | {
    action: "stop";
} | {
    action: "step";
    milliseconds: number;
} | {
    action: "event";
    event: FrameulatorEvent;
} | {
    action: "assert-state";
    state: SessionState;
};
export interface Scenario {
    id: string;
    label: string;
    steps: ScenarioStep[];
}
export type FrameulatorEvent = "tracking-lost" | "tracking-restored" | "runtime-exit" | "focus-lost";
export interface ScenarioAssertion {
    expected: SessionState;
    actual: SessionState;
    passed: boolean;
}
export interface KernelScenarioReport {
    schemaVersion: 1;
    frameulatorVersion: "0.1.0";
    scenario: string;
    profile: string;
    simulated: true;
    evidenceLevel: "F1-browser-wasm";
    passed: boolean;
    sessionState: SessionState;
    frameCount: number;
    elapsedMilliseconds: number;
    assertions: ScenarioAssertion[];
    services: Record<ServiceName, ServiceStatus>;
    generatedAt: string;
}
export interface ScenarioReport extends KernelScenarioReport {
    application: ApplicationEvidence;
}
export type ApplicationState = "EMPTY" | "HASHING" | "VERIFIED" | "LOADING_CAPSULE" | "READY" | "REJECTED" | "RUNNING" | "STOPPED" | "FAILED";
export interface AgoraRelease {
    appId: "dev.luminarylabs.Agora";
    version: string;
    architecture: "x86_64" | "aarch64";
    sourceCommit: string;
    flatpakFile: string;
    flatpakSha256: string;
    browserWasmFile: string;
    browserWasmSha256: string;
    executionMode: "browser-wasm-capsule";
}
export interface ReleaseRegistryDocument {
    schemaVersion: 1;
    algorithm: "Ed25519";
    keyId: string;
    payload: {
        releases: AgoraRelease[];
    };
    signature: string;
}
export interface TrustedReleaseKey {
    id: string;
    algorithm: "Ed25519";
    publicKeyBase64: string;
}
export type FlatpakInput = Blob & {
    name?: string;
};
export interface FlatpakVerification {
    accepted: boolean;
    fileName: string;
    size: number;
    flatpakSha256: string;
    release?: AgoraRelease;
    reason?: string;
}
export interface ApplicationEvidence {
    flatpakUploaded: true;
    flatpakHashVerified: true;
    matchingAgoraCodeExecuted: boolean;
    executionMode: "browser-wasm-capsule";
    nativeFlatpakInstalled: false;
    nativeFlatpakExecuted: false;
    hardwareSimulated: true;
    appId: "dev.luminarylabs.Agora";
    version: string;
    architecture: "x86_64" | "aarch64";
    sourceCommit: string;
    flatpakSha256: string;
    browserWasmSha256: string;
}
export interface NativeEvidence {
    schemaVersion: number;
    simulated: false;
    evidenceLevel: "F3-native-vulkan" | "F4-native-openxr" | "F5-arm64-flatpak" | "F6-device";
    producer: string;
    scenario: string;
    passed: boolean;
    generatedAt: string;
    [key: string]: unknown;
}
export interface EvidenceComparison {
    comparable: boolean;
    sameScenario: boolean;
    simulationPassed: boolean;
    nativePassed: boolean;
    simulationLevel: "F1-browser-wasm";
    nativeLevel: NativeEvidence["evidenceLevel"];
    note: string;
}
export interface ServiceStatus {
    name: ServiceName;
    status: "simulated" | "degraded" | "unavailable";
    simulated: true;
    detail: string;
}
export interface KernelCreateOptions {
    profile?: FrameulatorProfile | "steam-frame";
    wasmBytes?: ArrayBuffer | Uint8Array;
    wasmBase64?: string;
    wasmUrl?: string | URL;
}
export interface FrameulatorOptions extends KernelCreateOptions {
    container?: HTMLElement;
    renderer?: "auto" | "webgl2" | "none";
    storage?: "indexeddb" | "memory";
    network?: "disabled";
    worker?: "inline" | false;
    workerUrl?: string | URL;
    releaseRegistry?: ReleaseRegistryDocument | string | URL;
    trustedReleaseKeys?: TrustedReleaseKey[];
    maximumFlatpakBytes?: number;
}
export interface RpcRequest {
    protocol: "frameulator/1";
    requestId: number;
    method: string;
    parameters?: unknown;
}
export interface RpcResponse {
    protocol: "frameulator/1";
    requestId: number;
    ok: boolean;
    result?: unknown;
    error?: string;
}
