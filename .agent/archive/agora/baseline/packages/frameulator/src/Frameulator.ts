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
import { BrowserCapsule, applyCapsuleEvent, applyManagementCommand, runCapsuleScenario, type CapsuleSnapshot } from "./application/BrowserCapsule";
import { loadReleaseRegistry } from "./application/ReleaseRegistry";
import type { AgoraRelease, ApplicationEvidence, ApplicationState, FlatpakInput, FlatpakVerification, KernelScenarioReport, ManagementCommand, ManagementScenario, ManagementSnapshot, SessionState } from "./types";

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
      case "prepareRelease": {
        if (!this.capsule) throw new Error("Agora capsule is not loaded.");
        this.capsule.prepareRelease(Number(parameters) || 1);
        return { ...this.kernel.snapshot, applicationFrame: this.capsule.snapshot };
      }
      case "managementCommand": {
        if (!this.capsule) throw new Error("Agora capsule is not loaded.");
        const { command, value } = parameters as { command: ManagementCommand; value?: number };
        applyManagementCommand(this.capsule, command, value);
        if (command === "launch") this.kernel.start();
        if (command === "stop") { this.kernel.stop(); this.kernel.step(0); }
        if (command === "crash") this.kernel.injectEvent("runtime-exit");
        if (command === "recover" || command === "remove") this.kernel.reset();
        return { ...this.kernel.snapshot, applicationFrame: this.capsule.snapshot };
      }
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
  readonly version = "0.2.0";
  readonly simulated = true;
  private renderer?: FrameulatorRenderer;
  private running = false;
  private frameRequest = 0;
  private previousTime = 0;
  private stepping = false;
  private importedEvidence?: NativeEvidence;
  private readonly applicationGate: ApplicationGate;
  private lastReport?: ScenarioReport;
  private currentManagement?: ManagementSnapshot;

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
      throw new Error("Frameulator 0.2.0 only supports network: disabled.");
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
      if (snapshot.capsuleAbi !== result.verification.release?.capsuleAbi) {
        throw new Error("Agora capsule ABI does not match its signed release record.");
      }
      const prepared = await this.transport.request("prepareRelease", 1) as { applicationFrame: CapsuleSnapshot };
      this.updateManagement(prepared.applicationFrame.management);
      this.emit("frameulator-flatpak-verified", result.verification);
      this.emit("frameulator-package", result.verification);
      return result.verification;
    } catch (error) {
      if (this.applicationGate.state !== "REJECTED") {
        this.applicationGate.markFailed(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  async removeApplication(): Promise<void> {
    if (this.running || this.currentManagement?.applicationSessionState === "RUNNING") await this.stop();
    if (this.currentManagement && this.currentManagement.deploymentState !== "ABSENT") {
      await this.runManagementCommand("remove");
    }
    await this.transport.request("unloadCapsule");
    await this.store.clear();
    this.lastReport = undefined;
    this.currentManagement = undefined;
    this.renderer?.clearApplicationFrame();
    this.applicationGate.reset();
  }

  setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement): void {
    this.renderer?.setEyePreviews(left, right);
  }

  async start(): Promise<void> {
    await this.launchCapsule();
  }

  async rehearseDeploy(): Promise<ManagementSnapshot> {
    this.requireApplication();
    return this.runManagementCommand("stage");
  }

  async prepareDevice(): Promise<ManagementSnapshot> {
    this.requireApplication();
    if (!this.currentManagement) throw new Error("Agora management state is unavailable.");
    return structuredClone(this.currentManagement);
  }

  async stopCapsule(): Promise<void> {
    await this.stop();
  }

  async restartCapsule(): Promise<void> {
    if (this.currentManagement?.applicationSessionState === "RUNNING") await this.stopCapsule();
    if (this.currentManagement?.applicationSessionState === "CRASHED") await this.recoverCrash();
    await this.launchCapsule();
  }

  async launchCapsule(): Promise<void> {
    this.requireApplication();
    if (this.currentManagement?.deploymentState !== "DEPLOYED") {
      throw new Error("DEPLOYMENT_REQUIRED: rehearse deployment before launching Agora.");
    }
    const result = await this.transport.request("managementCommand", { command: "launch" }) as {
      applicationFrame: CapsuleSnapshot;
      headPose: Pose;
      controllers: Record<"left" | "right", ControllerState>;
      sessionState: SessionState;
    };
    this.renderer?.update(result);
    this.updateManagement(result.applicationFrame.management);
    this.applicationGate.markRunning();
    this.running = true;
    this.previousTime = performance.now();
    if (typeof requestAnimationFrame === "function") this.frameRequest = requestAnimationFrame(this.tick);
    this.emit("frameulator-state", result);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    const result = await this.transport.request("managementCommand", { command: "stop" }) as {
      applicationFrame: CapsuleSnapshot;
      headPose: Pose;
      controllers: Record<"left" | "right", ControllerState>;
      sessionState: SessionState;
    };
    this.renderer?.update(result);
    this.updateManagement(result.applicationFrame.management);
    if (this.applicationGate.verification?.accepted) this.applicationGate.markStopped();
    this.emit("frameulator-state", result);
  }

  async simulateUpdate(generation = 2): Promise<ManagementSnapshot> {
    this.requireApplication();
    return this.runManagementCommand("update", generation);
  }

  async simulateFailedUpdate(generation = 2): Promise<ManagementSnapshot> {
    this.requireApplication();
    return this.runManagementCommand("fail-update", generation);
  }

  async simulateRollback(): Promise<ManagementSnapshot> {
    this.requireApplication();
    return this.runManagementCommand("rollback");
  }

  async simulateCrash(): Promise<ManagementSnapshot> {
    this.requireApplication();
    this.running = false;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameRequest);
    return this.runManagementCommand("crash");
  }

  async recoverCrash(): Promise<ManagementSnapshot> {
    this.requireApplication();
    return this.runManagementCommand("recover");
  }

  async runManagementScenario(name: ManagementScenario): Promise<ManagementSnapshot> {
    this.requireApplication();
    if (name === "managed-normal-session") {
      if (this.currentManagement?.deploymentState === "ABSENT") await this.rehearseDeploy();
      await this.launchCapsule();
      await this.stopCapsule();
    } else if (name === "update-rollback") {
      if (this.currentManagement?.deploymentState === "ABSENT") await this.rehearseDeploy();
      const next = (this.currentManagement?.currentRelease ?? 1) + 1;
      await this.simulateUpdate(next);
      await this.simulateRollback();
    } else {
      if (this.currentManagement?.deploymentState === "ABSENT") await this.rehearseDeploy();
      await this.launchCapsule();
      await this.simulateCrash();
      await this.recoverCrash();
      await this.launchCapsule();
    }
    if (!this.currentManagement) throw new Error("Agora management scenario produced no state.");
    return structuredClone(this.currentManagement);
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
      management: this.managementEvidence(output.applicationFrame),
    };
    if (output.applicationFrame) this.updateManagement(output.applicationFrame.management);
    this.lastReport = structuredClone(report);
    if (["STOPPING", "IDLE"].includes(report.sessionState)) this.applicationGate.markStopped();
    else this.applicationGate.markRunning();
    await this.store.save(report);
    const snapshot = await this.transport.request("snapshot");
    this.renderer?.update(snapshot);
    this.emit("frameulator-result", report);
    this.emit("frameulator-evidence", report);
    this.emit("frameulator-state", { state: report.sessionState });
    return report;
  }

  async exportReport(): Promise<ScenarioReport> {
    this.lastReport ??= await this.store.latest();
    if (!this.lastReport) throw new Error("Run a verified Agora scenario before exporting a report.");
    return structuredClone(this.lastReport);
  }

  async latestReport(): Promise<ScenarioReport | undefined> {
    return this.store.latest();
  }

  async importEvidence(input: Blob | NativeEvidence): Promise<NativeEvidence> {
    if (input instanceof Blob && input.size > 5 * 1024 * 1024) {
      throw new Error("Native evidence JSON exceeds the 5 MB local limit.");
    }
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
    await this.store.saveNative(evidence);
    this.emit("frameulator-evidence", evidence);
    return structuredClone(evidence);
  }

  async latestNativeEvidence(): Promise<NativeEvidence | undefined> {
    this.importedEvidence ??= await this.store.latestNative();
    return this.importedEvidence ? structuredClone(this.importedEvidence) : undefined;
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
        if (snapshot.applicationFrame?.management) this.updateManagement(snapshot.applicationFrame.management);
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
      capsuleAbi: release.capsuleAbi,
      managementProtocol: release.managementProtocol,
    };
  }

  private managementEvidence(snapshot?: CapsuleSnapshot) {
    if (!snapshot) throw new Error("Agora management evidence is unavailable.");
    return {
      protocol: "agora-management/2" as const,
      simulatedDeployment: true as const,
      nativeDeployment: false as const,
      snapshot: structuredClone(snapshot.management),
    };
  }

  private async runManagementCommand(command: ManagementCommand, value?: number): Promise<ManagementSnapshot> {
    const snapshot = await this.transport.request("managementCommand", { command, value }) as {
      applicationFrame: CapsuleSnapshot;
      headPose: Pose;
      controllers: Record<"left" | "right", ControllerState>;
      sessionState: SessionState;
    };
    this.renderer?.update(snapshot);
    this.updateManagement(snapshot.applicationFrame.management);
    return structuredClone(snapshot.applicationFrame.management);
  }

  private updateManagement(snapshot: ManagementSnapshot): void {
    this.currentManagement = structuredClone(snapshot);
    this.emit("frameulator-management", this.currentManagement);
    this.emit("frameulator-device", { state: snapshot.deviceState });
    this.emit("frameulator-deployment", { state: snapshot.deploymentState });
    this.emit("frameulator-session", { state: snapshot.applicationSessionState });
    this.emit("frameulator-log", snapshot.events.at(-1) ?? { kind: snapshot.lastEvent });
  }
}
