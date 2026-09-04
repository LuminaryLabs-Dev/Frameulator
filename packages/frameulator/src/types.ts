export type SessionState =
  | "IDLE"
  | "READY"
  | "SYNCHRONIZED"
  | "VISIBLE"
  | "FOCUSED"
  | "STOPPING"
  | "LOSS_PENDING"
  | "EXITING";

export type ServiceName =
  | "hardware"
  | "gpu"
  | "vulkan"
  | "openxr"
  | "compositor"
  | "firmware"
  | "tracking"
  | "controllers"
  | "host";

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

export type ScenarioStep =
  | { action: "start" }
  | { action: "stop" }
  | { action: "step"; milliseconds: number }
  | { action: "event"; event: FrameulatorEvent }
  | { action: "assert-state"; state: SessionState };

export interface Scenario {
  id: string;
  label: string;
  steps: ScenarioStep[];
}

export type FrameulatorEvent =
  | "tracking-lost"
  | "tracking-restored"
  | "runtime-exit"
  | "focus-lost";

export interface ScenarioAssertion {
  expected: SessionState;
  actual: SessionState;
  passed: boolean;
}

export interface ScenarioReport {
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
