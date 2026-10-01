import type { ControllerState, KernelScenarioReport, Pose, SessionState } from "../types";
export type ApplicationState = "EMPTY" | "READY" | "RUNNING" | "STOPPED" | "FAILED";
export interface ApplicationManifest {
    id: string;
    name: string;
    version: string;
    [key: string]: unknown;
}
export interface Surface {
    id: string;
    width: number;
    height: number;
    rgba: Uint8Array;
    revision: number;
    visible?: boolean;
}
export interface SurfacePointerInput {
    type: "pointer";
    surfaceId: string;
    phase: "down" | "move" | "up" | "cancel";
    x: number;
    y: number;
    button: number;
}
export interface AdapterContext {
    manifest: ApplicationManifest;
    config: Record<string, unknown>;
}
export interface AdapterSnapshot {
    data: unknown;
    surfaces: Surface[];
}
/** Only reviewed host code may supply factories. This is not an untrusted-code sandbox. */
export interface ApplicationAdapter {
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    reset(): void | Promise<void>;
    step(milliseconds: number): void | Promise<void>;
    input(event: SurfacePointerInput): void | Promise<void>;
    action?(name: string, payload: Record<string, unknown>): void | Promise<void>;
    snapshot(): AdapterSnapshot | Promise<AdapterSnapshot>;
    dispose(): void | Promise<void>;
}
export interface ApplicationAdapterFactory {
    id: string;
    version: string;
    source: {
        kind: "builtin";
        version: string;
    } | {
        kind: "source";
        repository: string;
        commit: string;
    };
    create(context: AdapterContext): ApplicationAdapter | Promise<ApplicationAdapter>;
}
export interface ApplicationSelection {
    adapterId: string;
    manifest: ApplicationManifest;
    config?: Record<string, unknown>;
}
export interface ApplicationSnapshot extends AdapterSnapshot {
    state: ApplicationState;
    descriptor: ApplicationManifest;
    adapterId: string;
    adapterVersion: string;
    source: ApplicationAdapterFactory["source"];
}
export interface LabSnapshot {
    sessionState: SessionState;
    headPose: Pose;
    controllers: Record<"left" | "right", ControllerState>;
    frameCount: number;
    elapsedMilliseconds: number;
    simulated: true;
    application?: ApplicationSnapshot;
    applicationFrame?: AdapterSnapshot;
}
export interface ApplicationReport {
    schemaVersion: 3;
    frameulatorVersion: "0.3.0";
    scenario: string;
    profile: string;
    simulated: true;
    evidenceLevel: "F1-browser-wasm";
    passed: boolean;
    generatedAt: string;
    hostKernelExecuted: true;
    applicationExecuted: boolean;
    applicationAssertionsChecked: false;
    nativeExecutionProven: false;
    hardwareProven: false;
    host?: KernelScenarioReport;
    application?: {
        appId: string;
        version: string;
        adapterId: string;
        adapterVersion: string;
        source: ApplicationAdapterFactory["source"];
        executionMode: "trusted-js-adapter";
        trust: "host-injected";
        signatureVerified: false;
        state: ApplicationState;
        manifestSha256: string;
        config: Record<string, unknown>;
        data: unknown;
        surfaces: Array<{
            id: string;
            width: number;
            height: number;
            revision: number;
            sha256: string;
        }>;
    };
    events: Array<{
        sequence: number;
        method: string;
        parameters?: unknown;
    }>;
}
export declare function ensure(condition: unknown, message: string): asserts condition;
export declare function identifier(value: unknown): asserts value is string;
export declare function boundedJson<T>(value: T, maximum?: number): T;
export declare function validateSnapshot(value: AdapterSnapshot): AdapterSnapshot;
