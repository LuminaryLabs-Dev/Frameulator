import type { FrameulatorEvent, Scenario } from "../types";
export interface CapsuleSnapshot {
    sessionState: string;
    frameCount: number;
    elapsedMilliseconds: number;
    scenePhaseRadians: number;
    stereoContractValid: boolean;
    producer: "agora-browser-capsule";
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
    get snapshot(): CapsuleSnapshot;
}
export declare function runCapsuleScenario(capsule: BrowserCapsule, input: Scenario | string): CapsuleSnapshot;
export declare function applyCapsuleEvent(capsule: BrowserCapsule, event: FrameulatorEvent): void;
