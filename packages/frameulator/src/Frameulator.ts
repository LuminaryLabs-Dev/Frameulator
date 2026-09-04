import { FrameulatorKernel } from "./FrameulatorKernel";
import { FrameulatorRenderer } from "./renderer/FrameulatorRenderer";
import { IndexedDbReportStore, MemoryReportStore, type ReportStore } from "./storage/IndexedDbStore";
import type {
  ControllerState,
  FrameulatorEvent,
  FrameulatorOptions,
  EvidenceComparison,
  NativeEvidence,
  Pose,
  Scenario,
  ScenarioReport,
} from "./types";
import { WorkerClient } from "./WorkerClient";

interface Transport {
  request(method: string, parameters?: unknown): Promise<any>;
  destroy(): void;
}

class LocalTransport implements Transport {
  private constructor(private readonly kernel: FrameulatorKernel) {}

  static async create(options: FrameulatorOptions): Promise<LocalTransport> {
    return new LocalTransport(await FrameulatorKernel.create(options));
  }

  async request(method: string, parameters?: unknown): Promise<any> {
    switch (method) {
      case "start": return { state: this.kernel.start() };
      case "stop": return { state: this.kernel.stop() };
      case "step": this.kernel.step(Number(parameters)); return this.kernel.snapshot;
      case "setHeadPose": this.kernel.setHeadPose(parameters as Pose); return this.kernel.snapshot;
      case "setControllerState": {
        const { hand, state } = parameters as { hand: "left" | "right"; state: ControllerState };
        this.kernel.setControllerState(hand, state);
        return this.kernel.snapshot;
      }
      case "injectEvent": return { state: this.kernel.injectEvent(parameters as FrameulatorEvent) };
      case "runScenario": return this.kernel.runScenario(parameters as Scenario | string);
      case "exportReport": return this.kernel.exportReport();
      case "snapshot": return this.kernel.snapshot;
      default: return this.kernel.call(method);
    }
  }

  destroy(): void {}
}

export class Frameulator extends EventTarget {
  readonly version = "0.1.0";
  readonly simulated = true;
  private renderer?: FrameulatorRenderer;
  private running = false;
  private frameRequest = 0;
  private previousTime = 0;
  private stepping = false;
  private importedEvidence?: NativeEvidence;

  private constructor(
    private readonly transport: Transport,
    private readonly store: ReportStore,
  ) {
    super();
  }

  static async create(options: FrameulatorOptions = {}): Promise<Frameulator> {
    if (options.network && options.network !== "disabled") {
      throw new Error("Frameulator 0.1.0 only supports network: disabled.");
    }
    const useWorker = options.worker !== false && typeof Worker !== "undefined";
    const transport = useWorker ? await WorkerClient.create(options) : await LocalTransport.create(options);
    let store: ReportStore = new MemoryReportStore();
    if (options.storage !== "memory" && typeof indexedDB !== "undefined") {
      try {
        store = await IndexedDbReportStore.create();
      } catch {
        store = new MemoryReportStore();
      }
    }
    const frameulator = new Frameulator(transport, store);
    if (options.container && options.renderer !== "none") {
      frameulator.renderer = new FrameulatorRenderer(options.container);
    }
    frameulator.emit("frameulator-ready", { version: frameulator.version, simulated: true });
    return frameulator;
  }

  setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement): void {
    this.renderer?.setEyePreviews(left, right);
  }

  async start(): Promise<void> {
    const result = await this.transport.request("start");
    this.running = true;
    this.previousTime = performance.now();
    this.frameRequest = requestAnimationFrame(this.tick);
    this.emit("frameulator-state", result);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    const result = await this.transport.request("stop");
    this.emit("frameulator-state", result);
  }

  async setHeadPose(pose: Pose): Promise<void> {
    const snapshot = await this.transport.request("setHeadPose", pose);
    this.renderer?.update(snapshot);
  }

  async setControllerState(hand: "left" | "right", state: ControllerState): Promise<void> {
    const snapshot = await this.transport.request("setControllerState", { hand, state });
    this.renderer?.update(snapshot);
  }

  async injectEvent(event: FrameulatorEvent): Promise<void> {
    const result = await this.transport.request("injectEvent", event);
    this.emit("frameulator-state", result);
  }

  async call(method: string): Promise<unknown> {
    return this.transport.request(method);
  }

  async run(input: Scenario | string): Promise<ScenarioReport> {
    return this.runScenario(input);
  }

  async runScenario(input: Scenario | string): Promise<ScenarioReport> {
    const report = await this.transport.request("runScenario", input) as ScenarioReport;
    await this.store.save(report);
    const snapshot = await this.transport.request("snapshot");
    this.renderer?.update(snapshot);
    this.emit("frameulator-result", report);
    this.emit("frameulator-state", { state: report.sessionState });
    return report;
  }

  async exportReport(): Promise<ScenarioReport> {
    return this.transport.request("exportReport");
  }

  async latestReport(): Promise<ScenarioReport | undefined> {
    return this.store.latest();
  }

  async importEvidence(input: Blob | NativeEvidence): Promise<NativeEvidence> {
    const evidence = input instanceof Blob
      ? JSON.parse(await input.text()) as NativeEvidence
      : structuredClone(input);
    const allowed = new Set(["F3-native-vulkan", "F4-native-openxr", "F5-arm64-flatpak", "F6-device"]);
    if (evidence.simulated !== false || !allowed.has(evidence.evidenceLevel)) {
      throw new Error("Imported native evidence must be explicitly non-simulated and labeled F3 through F6.");
    }
    if (!evidence.producer || !evidence.scenario || !evidence.generatedAt) {
      throw new Error("Imported native evidence is missing producer, scenario, or generatedAt metadata.");
    }
    this.importedEvidence = evidence;
    return structuredClone(evidence);
  }

  compareEvidence(options: { simulation: ScenarioReport; native?: NativeEvidence }): EvidenceComparison {
    const native = options.native ?? this.importedEvidence;
    if (!native) throw new Error("Import or supply native evidence before comparison.");
    const sameScenario = options.simulation.scenario === native.scenario;
    return {
      comparable: sameScenario,
      sameScenario,
      simulationPassed: options.simulation.passed,
      nativePassed: native.passed,
      simulationLevel: "F1-browser-wasm",
      nativeLevel: native.evidenceLevel,
      note: sameScenario
        ? "Results share a scenario id; native evidence remains authoritative for native execution."
        : "Scenario ids differ, so pass/fail outcomes are not directly comparable.",
    };
  }

  async destroy(): Promise<void> {
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    this.renderer?.destroy();
    this.transport.destroy();
    this.store.close();
    this.importedEvidence = undefined;
  }

  private tick = async (time: number): Promise<void> => {
    if (!this.running) return;
    if (!this.stepping) {
      this.stepping = true;
      try {
        const delta = Math.min(50, Math.max(0, time - this.previousTime));
        const snapshot = await this.transport.request("step", delta);
        this.previousTime = time;
        this.renderer?.update(snapshot);
        this.emit("frameulator-frame", snapshot);
        this.emit("frameulator-state", { state: snapshot.sessionState });
      } catch (error) {
        this.emit("frameulator-error", { message: error instanceof Error ? error.message : String(error) });
        this.running = false;
      } finally {
        this.stepping = false;
      }
    }
    if (this.running) this.frameRequest = requestAnimationFrame(this.tick);
  };

  private emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
