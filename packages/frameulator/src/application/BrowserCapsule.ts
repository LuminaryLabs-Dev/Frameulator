import { resolveScenario } from "../scenario";
import type { FrameulatorEvent, Scenario } from "../types";

interface AgoraCapsuleExports extends WebAssembly.Exports {
  agora_capsule_abi_version(): number;
  agora_capsule_version(): number;
  agora_capsule_reset(): void;
  agora_capsule_start(): number;
  agora_capsule_stop(): number;
  agora_capsule_step(deltaMicros: number): number;
  agora_capsule_set_tracking(available: number): number;
  agora_capsule_session_state(): number;
  agora_capsule_frame_count(): bigint;
  agora_capsule_elapsed_micros(): bigint;
  agora_capsule_scene_phase_milliradians(): number;
  agora_capsule_stereo_contract_valid(): number;
}

const states = ["IDLE", "READY", "SYNCHRONIZED", "VISIBLE", "FOCUSED", "STOPPING", "LOSS_PENDING"] as const;

export interface CapsuleSnapshot {
  sessionState: string;
  frameCount: number;
  elapsedMilliseconds: number;
  scenePhaseRadians: number;
  stereoContractValid: boolean;
  producer: "agora-browser-capsule";
}

export class BrowserCapsule {
  private constructor(private readonly exports: AgoraCapsuleExports) {}

  static async create(source: ArrayBuffer | Uint8Array): Promise<BrowserCapsule> {
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const result = await WebAssembly.instantiate(bytes, {}) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
    const exports = result.instance.exports as AgoraCapsuleExports;
    if (typeof exports.agora_capsule_abi_version !== "function" || exports.agora_capsule_abi_version() !== 1) {
      throw new Error("Unsupported Agora browser capsule ABI.");
    }
    if (exports.agora_capsule_version() !== 1 || exports.agora_capsule_stereo_contract_valid() !== 1) {
      throw new Error("Agora browser capsule failed its stereo contract check.");
    }
    exports.agora_capsule_reset();
    return new BrowserCapsule(exports);
  }

  reset(): void { this.exports.agora_capsule_reset(); }
  start(): void { this.exports.agora_capsule_start(); }
  stop(): void { this.exports.agora_capsule_stop(); }
  step(milliseconds: number): void { this.exports.agora_capsule_step(Math.round(milliseconds * 1000)); }
  setTracking(available: boolean): void { this.exports.agora_capsule_set_tracking(available ? 1 : 0); }

  get snapshot(): CapsuleSnapshot {
    return {
      sessionState: states[this.exports.agora_capsule_session_state()] ?? "UNKNOWN",
      frameCount: Number(this.exports.agora_capsule_frame_count()),
      elapsedMilliseconds: Number(this.exports.agora_capsule_elapsed_micros()) / 1000,
      scenePhaseRadians: this.exports.agora_capsule_scene_phase_milliradians() / 1000,
      stereoContractValid: this.exports.agora_capsule_stereo_contract_valid() === 1,
      producer: "agora-browser-capsule",
    };
  }
}

export function runCapsuleScenario(capsule: BrowserCapsule, input: Scenario | string): CapsuleSnapshot {
  capsule.reset();
  for (const step of resolveScenario(input).steps) {
    switch (step.action) {
      case "start": capsule.start(); break;
      case "stop": capsule.stop(); break;
      case "step": capsule.step(step.milliseconds); break;
      case "event": applyCapsuleEvent(capsule, step.event); break;
      case "assert-state": break;
    }
  }
  return capsule.snapshot;
}

export function applyCapsuleEvent(capsule: BrowserCapsule, event: FrameulatorEvent): void {
  if (event === "tracking-lost") capsule.setTracking(false);
  if (event === "tracking-restored") capsule.setTracking(true);
  if (event === "runtime-exit") capsule.stop();
}
