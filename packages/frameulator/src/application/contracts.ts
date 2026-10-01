import type {
  ControllerState,
  KernelScenarioReport,
  Pose,
  SessionState,
} from "../types";
export type ApplicationState =
  | "EMPTY"
  | "READY"
  | "RUNNING"
  | "STOPPED"
  | "FAILED";
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
  source:
    | { kind: "builtin"; version: string }
    | { kind: "source"; repository: string; commit: string };
  create(
    context: AdapterContext,
  ): ApplicationAdapter | Promise<ApplicationAdapter>;
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
  events: Array<{ sequence: number; method: string; parameters?: unknown }>;
}
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function identifier(value: unknown): asserts value is string {
  ensure(
    typeof value === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value),
    "Invalid identifier",
  );
}
export function boundedJson<T>(value: T, maximum = 65536): T {
  const visit = (x: unknown, depth: number): void => {
    ensure(depth <= 16, "JSON depth limit exceeded");
    if (x === null || typeof x === "string" || typeof x === "boolean") return;
    if (typeof x === "number") {
      ensure(Number.isFinite(x), "JSON numbers must be finite");
      return;
    }
    ensure(
      typeof x === "object" &&
        (Array.isArray(x) || Object.getPrototypeOf(x) === Object.prototype),
      "Plain JSON data required",
    );
    for (const v of Object.values(x as object)) visit(v, depth + 1);
  };
  visit(value, 0);
  const text = JSON.stringify(value);
  ensure(text.length <= maximum, "JSON size limit exceeded");
  return JSON.parse(text);
}
export function validateSnapshot(value: AdapterSnapshot): AdapterSnapshot {
  ensure(
    value && Array.isArray(value.surfaces) && value.surfaces.length <= 4,
    "At most four surfaces supported",
  );
  const ids = new Set();
  let bytes = 0;
  const surfaces = value.surfaces.map((s) => {
    identifier(s.id);
    ensure(!ids.has(s.id), "Duplicate surface");
    ids.add(s.id);
    ensure(
      Number.isSafeInteger(s.width) &&
        s.width > 0 &&
        s.width <= 1024 &&
        Number.isSafeInteger(s.height) &&
        s.height > 0 &&
        s.height <= 1024,
      "Invalid surface dimensions",
    );
    ensure(
      s.rgba instanceof Uint8Array && s.rgba.length === s.width * s.height * 4,
      "Invalid RGBA buffer",
    );
    bytes += s.rgba.length;
    ensure(bytes <= 16 * 1024 * 1024, "Surface byte limit exceeded");
    ensure(
      Number.isSafeInteger(s.revision) && s.revision >= 0,
      "Invalid surface revision",
    );
    ensure(
      s.visible === undefined || typeof s.visible === "boolean",
      "Invalid visibility",
    );
    return {
      id: s.id,
      width: s.width,
      height: s.height,
      rgba: s.rgba.slice(),
      revision: s.revision,
      ...(s.visible === undefined ? {} : { visible: s.visible }),
    };
  });
  return { data: boundedJson(value.data), surfaces };
}
