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
import { ApplicationGate } from "./application/ApplicationGate";
import { BrowserCapsule, applyCapsuleEvent, runCapsuleScenario, type CapsuleSnapshot } from "./application/BrowserCapsule";
import { loadReleaseRegistry } from "./application/ReleaseRegistry";
import type { AgoraRelease, ApplicationEvidence, ApplicationState, FlatpakInput, FlatpakVerification, KernelScenarioReport } from "./types";

interface Transport {
  request(method: string, parameters?: unknown): Promise<any>;
  destroy(): void;
}

class LocalTransport implements Transport {
  private capsule?: BrowserCapsule;
  private constructor(private readonly kernel: FrameulatorKernel) {}

  static async create(options: FrameulatorOptions): Promise<LocalTransport> {
    return new LocalTransport(await FrameulatorKernel.create(options));
  }

  async request(method: string, parameters?: unknown): Promise<any> {
    switch (method) {
      case "loadCapsule": this.capsule = await BrowserCapsule.create(parameters as Uint8Array); return this.capsule.snapshot;
      case "unloadCapsule": this.capsule = undefined; return { unloaded: true };
      case "start": this.capsule?.start(); return { state: this.kernel.start(), applicationFrame: this.capsule?.snapshot };
      case "stop": this.capsule?.stop(); return { state: this.kernel.stop(), applicationFrame: this.capsule?.snapshot };
      case "step": this.kernel.step(Number(parameters)); this.capsule?.step(Number(parameters)); return { ...this.kernel.snapshot, applicationFrame: this.capsule?.snapshot };
      case "setHeadPose": this.kernel.setHeadPose(parameters as Pose); return this.kernel.snapshot;
      case "setControllerState": {
        const { hand, state } = parameters as { hand: "left" | "right"; state: ControllerState };
        this.kernel.setControllerState(hand, state);
        return this.kernel.snapshot;
      }
      case "injectEvent": {
        const event = parameters as FrameulatorEvent;
        if (this.capsule) applyCapsuleEvent(this.capsule, event);
        this.kernel.injectEvent(event);
        return { ...this.kernel.snapshot, state: this.kernel.sessionState, applicationFrame: this.capsule?.snapshot };
      }
      case "runScenario": return {
        report: await this.kernel.runScenario(parameters as Scenario | string),
        applicationFrame: this.capsule ? runCapsuleScenario(this.capsule, parameters as Scenario | string) : undefined,
      };
      case "exportReport": return this.kernel.exportReport();
      case "snapshot": return { ...this.kernel.snapshot, applicationFrame: this.capsule?.snapshot };
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
  private readonly applicationGate: ApplicationGate;
  private lastReport?: ScenarioReport;

  private constructor(
    private readonly transport: Transport,
    private readonly store: ReportStore,
    releases: AgoraRelease[],
    registryBaseUrl: URL | undefined,
    maximumFlatpakBytes: number,
  ) {
    super();
    this.applicationGate = new ApplicationGate({
      releases,
      registryBaseUrl,
      maximumBytes: maximumFlatpakBytes,
      onState: (state, detail, progress) => this.emit("frameulator-application", { state, detail, progress }),
    });
  }

  static async create(options: FrameulatorOptions = {}): Promise<Frameulator> {
    if (options.network && options.network !== "disabled") {
      throw new Error("Frameulator 0.1.0 only supports network: disabled.");
    }
    const registry = await loadReleaseRegistry(options.releaseRegistry, options.trustedReleaseKeys ?? []);
    const maximumFlatpakBytes = options.maximumFlatpakBytes ?? 200 * 1024 * 1024;
    if (!Number.isSafeInteger(maximumFlatpakBytes) || maximumFlatpakBytes <= 0) {
      throw new Error("maximumFlatpakBytes must be a positive integer.");
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
    const frameulator = new Frameulator(transport, store, registry.releases, registry.baseUrl, maximumFlatpakBytes);
    if (options.container && options.renderer !== "none") {
      frameulator.renderer = new FrameulatorRenderer(options.container);
    }
    frameulator.emit("frameulator-ready", { version: frameulator.version, simulated: true, applicationState: "EMPTY" });
    return frameulator;
  }

  get applicationState(): ApplicationState {
    return this.applicationGate.state;
  }

  get flatpakVerification(): FlatpakVerification | undefined {
    return this.applicationGate.verification;
  }

  async selectFlatpak(input: FlatpakInput): Promise<FlatpakVerification> {
    try {
      const result = await this.applicationGate.verify(input);
      const snapshot = await this.transport.request("loadCapsule", result.capsuleBytes) as CapsuleSnapshot;
      if (!snapshot.stereoContractValid) throw new Error("Agora capsule did not validate its stereo scene contract.");
      this.emit("frameulator-flatpak-verified", result.verification);
      return result.verification;
    } catch (error) {
      if (this.applicationGate.state !== "REJECTED") {
        this.applicationGate.markFailed(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  async removeApplication(): Promise<void> {
    if (this.running) await this.stop();
    await this.transport.request("unloadCapsule");
    this.lastReport = undefined;
    this.renderer?.clearApplicationFrame();
    this.applicationGate.reset();
  }

  setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement): void {
    this.renderer?.setEyePreviews(left, right);
  }

  async start(): Promise<void> {
    this.requireApplication();
    const result = await this.transport.request("start");
    this.applicationGate.markRunning();
    this.running = true;
    this.previousTime = performance.now();
    this.frameRequest = requestAnimationFrame(this.tick);
    this.emit("frameulator-state", result);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    const result = await this.transport.request("stop");
    if (this.applicationGate.verification?.accepted) this.applicationGate.markStopped();
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
    this.renderer?.update(result);
    this.emit("frameulator-state", result);
  }

  async call(method: string): Promise<unknown> {
    return this.transport.request(method);
  }

  async run(input: Scenario | string): Promise<ScenarioReport> {
    return this.runScenario(input);
  }

  async runScenario(input: Scenario | string): Promise<ScenarioReport> {
    this.requireApplication();
    const output = await this.transport.request("runScenario", input) as {
      report: KernelScenarioReport;
      applicationFrame?: CapsuleSnapshot;
    };
    const report: ScenarioReport = {
      ...output.report,
      application: this.applicationEvidence(output.applicationFrame),
    };
    this.lastReport = structuredClone(report);
    if (["STOPPING", "IDLE"].includes(report.sessionState)) this.applicationGate.markStopped();
    else this.applicationGate.markRunning();
    await this.store.save(report);
    const snapshot = await this.transport.request("snapshot");
    this.renderer?.update(snapshot);
    this.emit("frameulator-result", report);
    this.emit("frameulator-state", { state: report.sessionState });
    return report;
  }

  async exportReport(): Promise<ScenarioReport> {
    if (!this.lastReport) throw new Error("Run a verified Agora scenario before exporting a report.");
    return structuredClone(this.lastReport);
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
    this.lastReport = undefined;
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

  private requireApplication(): void {
    if (!this.applicationGate.verification?.accepted || !["READY", "STOPPED", "RUNNING"].includes(this.applicationGate.state)) {
      throw new Error("FLATPAK_REQUIRED: select an approved Agora Flatpak before starting a session.");
    }
  }

  private applicationEvidence(snapshot?: CapsuleSnapshot): ApplicationEvidence {
    const release = this.applicationGate.verification?.release;
    if (!release) throw new Error("The verified Agora release is unavailable.");
    return {
      flatpakUploaded: true,
      flatpakHashVerified: true,
      matchingAgoraCodeExecuted: Boolean(snapshot?.stereoContractValid && snapshot.frameCount > 0),
      executionMode: "browser-wasm-capsule",
      nativeFlatpakInstalled: false,
      nativeFlatpakExecuted: false,
      hardwareSimulated: true,
      appId: release.appId,
      version: release.version,
      architecture: release.architecture,
      sourceCommit: release.sourceCommit,
      flatpakSha256: release.flatpakSha256,
      browserWasmSha256: release.browserWasmSha256,
    };
  }
}
