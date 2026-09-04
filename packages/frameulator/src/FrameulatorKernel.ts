import { resolveProfile } from "./profile";
import { resolveScenario } from "./scenario";
import { createWorld, queryService, serviceStatuses, type SimulationWorld } from "./services";
import type {
  ControllerState,
  FrameulatorEvent,
  FrameulatorProfile,
  KernelCreateOptions,
  Pose,
  Scenario,
  ScenarioAssertion,
  KernelScenarioReport,
  SessionState,
} from "./types";
import { instantiateKernel, type KernelExports } from "./wasm";

const states: SessionState[] = [
  "IDLE",
  "READY",
  "SYNCHRONIZED",
  "VISIBLE",
  "FOCUSED",
  "STOPPING",
  "LOSS_PENDING",
  "EXITING",
];

const events: Record<FrameulatorEvent, number> = {
  "tracking-lost": 1,
  "tracking-restored": 2,
  "runtime-exit": 3,
  "focus-lost": 4,
};

export class FrameulatorKernel {
  readonly profile: FrameulatorProfile;
  private readonly wasm: KernelExports;
  private world: SimulationWorld;
  private lastReport?: KernelScenarioReport;

  private constructor(profile: FrameulatorProfile, wasm: KernelExports) {
    this.profile = profile;
    this.wasm = wasm;
    this.world = createWorld();
  }

  static async create(options: KernelCreateOptions = {}): Promise<FrameulatorKernel> {
    const embedded = typeof __FRAMEULATOR_WASM_BASE64__ === "string" ? __FRAMEULATOR_WASM_BASE64__ : "";
    const hasExplicitSource = Boolean(options.wasmBytes || options.wasmBase64 || options.wasmUrl);
    const wasm = await instantiateKernel({
      wasmBytes: options.wasmBytes,
      wasmBase64: options.wasmBase64 || embedded,
      wasmUrl: hasExplicitSource || embedded ? options.wasmUrl : new URL("./frameulator.wasm", import.meta.url),
    });
    wasm.frameulator_reset();
    return new FrameulatorKernel(resolveProfile(options.profile), wasm);
  }

  get sessionState(): SessionState {
    return states[this.wasm.frameulator_session_state()] ?? "IDLE";
  }

  get frameCount(): number {
    return Number(this.wasm.frameulator_frame_count());
  }

  get elapsedMilliseconds(): number {
    return Number(this.wasm.frameulator_elapsed_micros()) / 1000;
  }

  get snapshot() {
    return {
      sessionState: this.sessionState,
      frameCount: this.frameCount,
      elapsedMilliseconds: this.elapsedMilliseconds,
      headPose: structuredClone(this.world.headPose),
      controllers: structuredClone(this.world.controllers),
      simulated: true as const,
    };
  }

  reset(): void {
    this.wasm.frameulator_reset();
    this.world = createWorld();
    this.lastReport = undefined;
  }

  start(): SessionState {
    this.wasm.frameulator_start();
    return this.sessionState;
  }

  stop(): SessionState {
    this.wasm.frameulator_stop();
    return this.sessionState;
  }

  step(milliseconds: number): SessionState {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 1000) {
      throw new Error("Frame step must be between 0 and 1000 milliseconds.");
    }
    this.wasm.frameulator_step(Math.round(milliseconds * 1000));
    this.world.compositorFrames += 1;
    return this.sessionState;
  }

  setHeadPose(pose: Pose): void {
    this.world.headPose = structuredClone(pose);
  }

  setControllerState(hand: "left" | "right", state: ControllerState): void {
    this.world.controllers[hand] = { ...this.world.controllers[hand], ...structuredClone(state) };
  }

  injectEvent(event: FrameulatorEvent): SessionState {
    this.wasm.frameulator_inject_event(events[event]);
    if (event === "tracking-lost") this.world.trackingAvailable = false;
    if (event === "tracking-restored") this.world.trackingAvailable = true;
    return this.sessionState;
  }

  call(method: string): unknown {
    return queryService(method, this.profile, this.world);
  }

  async runScenario(input: Scenario | string): Promise<KernelScenarioReport> {
    const scenario = resolveScenario(input);
    const assertions: ScenarioAssertion[] = [];
    this.reset();

    for (const step of scenario.steps) {
      switch (step.action) {
        case "start":
          this.start();
          break;
        case "stop":
          this.stop();
          break;
        case "step":
          this.step(step.milliseconds);
          break;
        case "event":
          this.injectEvent(step.event);
          break;
        case "assert-state": {
          const actual = this.sessionState;
          assertions.push({ expected: step.state, actual, passed: actual === step.state });
          break;
        }
      }
    }

    this.lastReport = {
      schemaVersion: 1,
      frameulatorVersion: "0.1.0",
      scenario: scenario.id,
      profile: this.profile.id,
      simulated: true,
      evidenceLevel: "F1-browser-wasm",
      passed: assertions.length > 0 && assertions.every((assertion) => assertion.passed),
      sessionState: this.sessionState,
      frameCount: this.frameCount,
      elapsedMilliseconds: this.elapsedMilliseconds,
      assertions,
      services: serviceStatuses(),
      generatedAt: new Date().toISOString(),
    };
    return structuredClone(this.lastReport);
  }

  exportReport(): KernelScenarioReport {
    if (!this.lastReport) throw new Error("Run a scenario before exporting a report.");
    return structuredClone(this.lastReport);
  }
}
