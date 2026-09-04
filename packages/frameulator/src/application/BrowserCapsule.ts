import { resolveScenario } from "../scenario";
import type { FrameulatorEvent, ManagementCommand, ManagementSnapshot, Scenario } from "../types";

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
  agora_capsule_tracking_available(): number;
  agora_capsule_stereo_contract_valid(): number;
  agora_capsule_management_command(command: number, value: number): number;
  agora_capsule_management_device_state(): number;
  agora_capsule_management_deployment_state(): number;
  agora_capsule_management_session_state(): number;
  agora_capsule_management_test_state(): number;
  agora_capsule_management_project_state(): number;
  agora_capsule_management_current_release(): number;
  agora_capsule_management_previous_release(): number;
  agora_capsule_management_event_count(): number;
  agora_capsule_management_last_event(): number;
  agora_capsule_management_event_sequence(index: number): number;
  agora_capsule_management_event_kind(index: number): number;
  agora_capsule_management_event_value(index: number): number;
}

const states = ["IDLE", "READY", "SYNCHRONIZED", "VISIBLE", "FOCUSED", "STOPPING", "LOSS_PENDING"] as const;
const deviceStates = ["OFFLINE", "AVAILABLE", "DEGRADED", "FAILED"] as const;
const deploymentStates = ["ABSENT", "STAGING", "DEPLOYED", "UPDATING", "ROLLING_BACK", "REMOVING", "FAILED"] as const;
const applicationStates = ["IDLE", "LAUNCHING", "RUNNING", "STOPPING", "CRASHED"] as const;
const testStates = ["NOT_RUN", "RUNNING", "PASSED", "FAILED", "BLOCKED"] as const;
const projectStates = ["EMPTY", "LOADED", "VALIDATED", "BUILT", "FAILED"] as const;
const managementEvents = [
  "RESET", "DEVICE_ATTACHED", "RELEASE_VERIFIED", "DEPLOYMENT_STAGED", "DEPLOYMENT_COMPLETED",
  "SESSION_LAUNCHING", "SESSION_RUNNING", "SESSION_STOPPING", "SESSION_STOPPED", "UPDATE_STARTED",
  "UPDATE_COMPLETED", "UPDATE_FAILED", "ROLLBACK_STARTED", "ROLLBACK_COMPLETED", "REMOVAL_STARTED",
  "REMOVAL_COMPLETED", "SESSION_CRASHED", "PROJECT_LOADED", "PROJECT_VALIDATED", "PROJECT_BUILT",
  "TEST_STARTED", "TEST_PASSED", "TEST_FAILED", "SESSION_RECOVERED",
] as const;
const managementCommands: Record<ManagementCommand, number> = {
  "attach-device": 1,
  "verify-release": 2,
  stage: 3,
  launch: 4,
  stop: 5,
  update: 6,
  "fail-update": 7,
  rollback: 8,
  remove: 9,
  crash: 10,
  "load-project": 11,
  "validate-project": 12,
  "build-project": 13,
  "start-test": 14,
  "pass-test": 15,
  "fail-test": 16,
  recover: 17,
};

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

export class BrowserCapsule {
  private constructor(private readonly exports: AgoraCapsuleExports) {}

  static async create(source: ArrayBuffer | Uint8Array): Promise<BrowserCapsule> {
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const result = await WebAssembly.instantiate(bytes, {}) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
    const exports = result.instance.exports as AgoraCapsuleExports;
    if (typeof exports.agora_capsule_abi_version !== "function" || exports.agora_capsule_abi_version() !== 2) {
      throw new Error("Unsupported Agora browser capsule ABI. Frameulator 0.2.0 requires ABI 2.");
    }
    if (exports.agora_capsule_version() !== 2 || exports.agora_capsule_stereo_contract_valid() !== 1) {
      throw new Error("Agora browser capsule failed its version or stereo contract check.");
    }
    const requiredManagementExports = [
      "agora_capsule_management_command",
      "agora_capsule_management_device_state",
      "agora_capsule_management_deployment_state",
      "agora_capsule_management_session_state",
      "agora_capsule_management_test_state",
      "agora_capsule_management_project_state",
      "agora_capsule_management_current_release",
      "agora_capsule_management_previous_release",
      "agora_capsule_management_event_count",
      "agora_capsule_management_last_event",
      "agora_capsule_management_event_sequence",
      "agora_capsule_management_event_kind",
      "agora_capsule_management_event_value",
      "agora_capsule_tracking_available",
    ] as const;
    const missing = requiredManagementExports.find((name) => typeof exports[name] !== "function");
    if (missing) {
      throw new Error(`Agora browser capsule ABI 2 is incomplete: ${missing}.`);
    }
    exports.agora_capsule_reset();
    return new BrowserCapsule(exports);
  }

  reset(): void { this.exports.agora_capsule_reset(); }
  start(): void {
    if (this.exports.agora_capsule_start() === 0) throw new Error("Deploy and launch Agora before starting OpenXR.");
  }
  stop(): void { this.exports.agora_capsule_stop(); }
  step(milliseconds: number): void { this.exports.agora_capsule_step(Math.round(milliseconds * 1000)); }
  setTracking(available: boolean): void { this.exports.agora_capsule_set_tracking(available ? 1 : 0); }

  command(command: ManagementCommand, value = 0): ManagementSnapshot {
    const result = this.exports.agora_capsule_management_command(managementCommands[command], value);
    if (result !== 0) throw new Error(`Agora rejected management command ${command} (${result}).`);
    return this.managementSnapshot;
  }

  prepareRelease(generation = 1): ManagementSnapshot {
    this.command("attach-device");
    this.command("verify-release", generation);
    this.command("load-project");
    this.command("validate-project");
    return this.command("build-project");
  }

  stage(): ManagementSnapshot {
    this.command("stage");
    this.step(0);
    return this.managementSnapshot;
  }

  launch(): ManagementSnapshot {
    this.command("launch");
    this.step(0);
    this.start();
    return this.managementSnapshot;
  }

  stopManaged(): ManagementSnapshot {
    this.stop();
    this.command("stop");
    this.step(0);
    return this.managementSnapshot;
  }

  update(generation: number): ManagementSnapshot {
    this.command("update", generation);
    this.step(0);
    return this.managementSnapshot;
  }

  failUpdate(generation: number): ManagementSnapshot {
    this.command("update", generation);
    this.command("fail-update");
    this.step(0);
    return this.managementSnapshot;
  }

  rollback(): ManagementSnapshot {
    this.command("rollback");
    this.step(0);
    return this.managementSnapshot;
  }

  remove(): ManagementSnapshot {
    this.command("remove");
    this.step(0);
    return this.managementSnapshot;
  }

  crash(): ManagementSnapshot {
    this.command("crash");
    this.setTracking(false);
    return this.managementSnapshot;
  }

  recover(): ManagementSnapshot {
    this.command("recover");
    this.setTracking(true);
    return this.managementSnapshot;
  }

  get managementSnapshot(): ManagementSnapshot {
    const eventCount = this.exports.agora_capsule_management_event_count();
    const events = Array.from({ length: eventCount }, (_, index) => ({
      sequence: this.exports.agora_capsule_management_event_sequence(index),
      kind: managementEvents[this.exports.agora_capsule_management_event_kind(index)] ?? "UNKNOWN",
      value: this.exports.agora_capsule_management_event_value(index),
    }));
    return {
      protocol: "agora-management/2",
      deviceState: deviceStates[this.exports.agora_capsule_management_device_state()] ?? "FAILED",
      deploymentState: deploymentStates[this.exports.agora_capsule_management_deployment_state()] ?? "FAILED",
      applicationSessionState: applicationStates[this.exports.agora_capsule_management_session_state()] ?? "CRASHED",
      testState: testStates[this.exports.agora_capsule_management_test_state()] ?? "FAILED",
      projectState: projectStates[this.exports.agora_capsule_management_project_state()] ?? "FAILED",
      currentRelease: this.exports.agora_capsule_management_current_release(),
      previousRelease: this.exports.agora_capsule_management_previous_release(),
      eventCount,
      lastEvent: managementEvents[this.exports.agora_capsule_management_last_event()] ?? "UNKNOWN",
      events,
    };
  }

  get snapshot(): CapsuleSnapshot {
    return {
      sessionState: states[this.exports.agora_capsule_session_state()] ?? "UNKNOWN",
      frameCount: Number(this.exports.agora_capsule_frame_count()),
      elapsedMilliseconds: Number(this.exports.agora_capsule_elapsed_micros()) / 1000,
      scenePhaseRadians: this.exports.agora_capsule_scene_phase_milliradians() / 1000,
      stereoContractValid: this.exports.agora_capsule_stereo_contract_valid() === 1,
      producer: "agora-browser-capsule",
      capsuleAbi: 2,
      trackingAvailable: this.exports.agora_capsule_tracking_available() === 1,
      warnings: this.exports.agora_capsule_tracking_available() === 1 ? [] : ["TRACKING_UNAVAILABLE"],
      management: this.managementSnapshot,
    };
  }
}

export function runCapsuleScenario(capsule: BrowserCapsule, input: Scenario | string): CapsuleSnapshot {
  capsule.reset();
  capsule.prepareRelease(1);
  capsule.stage();
  capsule.command("start-test");
  for (const step of resolveScenario(input).steps) {
    switch (step.action) {
      case "start": capsule.launch(); break;
      case "stop": capsule.stopManaged(); break;
      case "step": capsule.step(step.milliseconds); break;
      case "event": applyCapsuleEvent(capsule, step.event); break;
      case "assert-state": break;
    }
  }
  const snapshot = capsule.snapshot;
  const passed = snapshot.stereoContractValid && !["LOSS_PENDING", "UNKNOWN"].includes(snapshot.sessionState);
  capsule.command(passed ? "pass-test" : "fail-test");
  return capsule.snapshot;
}

export function applyCapsuleEvent(capsule: BrowserCapsule, event: FrameulatorEvent): void {
  if (event === "tracking-lost") capsule.setTracking(false);
  if (event === "tracking-restored") capsule.setTracking(true);
  if (event === "runtime-exit" && capsule.managementSnapshot.applicationSessionState === "RUNNING") {
    capsule.stopManaged();
  }
}

export function applyManagementCommand(
  capsule: BrowserCapsule,
  command: ManagementCommand,
  value = 0,
): CapsuleSnapshot {
  switch (command) {
    case "stage": capsule.stage(); break;
    case "launch": capsule.launch(); break;
    case "stop": capsule.stopManaged(); break;
    case "update": capsule.update(value); break;
    case "fail-update": capsule.failUpdate(value); break;
    case "rollback": capsule.rollback(); break;
    case "remove": capsule.remove(); break;
    case "crash": capsule.crash(); break;
    case "recover": capsule.recover(); break;
    default: capsule.command(command, value); break;
  }
  return capsule.snapshot;
}
