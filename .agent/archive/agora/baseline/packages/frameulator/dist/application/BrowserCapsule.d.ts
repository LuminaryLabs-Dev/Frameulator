import type { FrameulatorEvent, ManagementCommand, ManagementSnapshot, Scenario } from "../types";
export interface CapsuleSnapshot {
    sessionState: string;
    frameCount: number;
    elapsedMilliseconds: number;
    scenePhaseRadians: number;
    stereoContractValid: boolean;
    producer: "agora-browser-capsule";
    capsuleAbi: 2;
    trackingAvailable: boolean;
    warnings: string[];
    management: ManagementSnapshot;
}
export declare class BrowserCapsule {
    private readonly exports;
    private constructor();
    static create(source: ArrayBuffer | Uint8Array): Promise<BrowserCapsule>;
    reset(): void;
    start(): void;
    stop(): void;
    step(milliseconds: number): void;
    setTracking(available: boolean): void;
    command(command: ManagementCommand, value?: number): ManagementSnapshot;
    prepareRelease(generation?: number): ManagementSnapshot;
    stage(): ManagementSnapshot;
    launch(): ManagementSnapshot;
    stopManaged(): ManagementSnapshot;
    update(generation: number): ManagementSnapshot;
    failUpdate(generation: number): ManagementSnapshot;
    rollback(): ManagementSnapshot;
    remove(): ManagementSnapshot;
    crash(): ManagementSnapshot;
    recover(): ManagementSnapshot;
    get managementSnapshot(): ManagementSnapshot;
    get snapshot(): CapsuleSnapshot;
}
export declare function runCapsuleScenario(capsule: BrowserCapsule, input: Scenario | string): CapsuleSnapshot;
export declare function applyCapsuleEvent(capsule: BrowserCapsule, event: FrameulatorEvent): void;
export declare function applyManagementCommand(capsule: BrowserCapsule, command: ManagementCommand, value?: number): CapsuleSnapshot;
