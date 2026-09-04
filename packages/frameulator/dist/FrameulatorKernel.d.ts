import type { ControllerState, FrameulatorEvent, FrameulatorProfile, KernelCreateOptions, Pose, Scenario, ScenarioReport, SessionState } from "./types";
export declare class FrameulatorKernel {
    readonly profile: FrameulatorProfile;
    private readonly wasm;
    private world;
    private lastReport?;
    private constructor();
    static create(options?: KernelCreateOptions): Promise<FrameulatorKernel>;
    get sessionState(): SessionState;
    get frameCount(): number;
    get elapsedMilliseconds(): number;
    get snapshot(): {
        sessionState: SessionState;
        frameCount: number;
        elapsedMilliseconds: number;
        headPose: Pose;
        controllers: Record<"left" | "right", ControllerState>;
        simulated: true;
    };
    reset(): void;
    start(): SessionState;
    stop(): SessionState;
    step(milliseconds: number): SessionState;
    setHeadPose(pose: Pose): void;
    setControllerState(hand: "left" | "right", state: ControllerState): void;
    injectEvent(event: FrameulatorEvent): SessionState;
    call(method: string): unknown;
    runScenario(input: Scenario | string): Promise<ScenarioReport>;
    exportReport(): ScenarioReport;
}
