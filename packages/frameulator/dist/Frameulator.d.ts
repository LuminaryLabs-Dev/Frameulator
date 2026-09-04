import type { ControllerState, FrameulatorEvent, FrameulatorOptions, EvidenceComparison, NativeEvidence, Pose, Scenario, ScenarioReport } from "./types";
export declare class Frameulator extends EventTarget {
    private readonly transport;
    private readonly store;
    readonly version = "0.1.0";
    readonly simulated = true;
    private renderer?;
    private running;
    private frameRequest;
    private previousTime;
    private stepping;
    private importedEvidence?;
    private constructor();
    static create(options?: FrameulatorOptions): Promise<Frameulator>;
    setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement): void;
    start(): Promise<void>;
    stop(): Promise<void>;
    setHeadPose(pose: Pose): Promise<void>;
    setControllerState(hand: "left" | "right", state: ControllerState): Promise<void>;
    injectEvent(event: FrameulatorEvent): Promise<void>;
    call(method: string): Promise<unknown>;
    run(input: Scenario | string): Promise<ScenarioReport>;
    runScenario(input: Scenario | string): Promise<ScenarioReport>;
    exportReport(): Promise<ScenarioReport>;
    latestReport(): Promise<ScenarioReport | undefined>;
    importEvidence(input: Blob | NativeEvidence): Promise<NativeEvidence>;
    compareEvidence(options: {
        simulation: ScenarioReport;
        native?: NativeEvidence;
    }): EvidenceComparison;
    destroy(): Promise<void>;
    private tick;
    private emit;
}
