import { FrameulatorKernel } from "./FrameulatorKernel";
import { FrameulatorRenderer } from "./renderer/FrameulatorRenderer";
import { WorkerClient } from "./WorkerClient";
import { ApplicationHost } from "./application/ApplicationHost";
import {
  ensure,
  boundedJson,
  type ApplicationSelection,
  type ApplicationState,
  type SurfacePointerInput,
  type LabSnapshot,
  type ApplicationReport,
} from "./application/contracts";
import {
  MemoryReportStore,
  IndexedDbReportStore,
  type ReportStore,
} from "./storage/IndexedDbStore";
import type {
  FrameulatorOptions,
  NativeEvidence,
  EvidenceComparison,
  Scenario,
  Pose,
  ControllerState,
  FrameulatorEvent,
} from "./types";
interface Transport {
  request(method: string, parameters?: unknown): Promise<any>;
  destroy(): unknown;
}
export class Frameulator extends EventTarget {
  readonly version = "0.3.0";
  readonly simulated = true;
  private renderer?: FrameulatorRenderer;
  private frame = 0;
  private previous = 0;
  private running = false;
  private closed = false;
  private _state: ApplicationState = "EMPTY";
  private applicationLabel = "";
  private generation = 0;
  private reportEpoch = 0;
  private constructor(
    private readonly transport: Transport,
    private readonly store: ReportStore,
  ) {
    super();
  }
  static async create(options: FrameulatorOptions = {}): Promise<Frameulator> {
    ensure(
      !options.network || options.network === "disabled",
      "Application networking is disabled",
    );
    const useWorker = options.worker !== false && typeof Worker !== "undefined";
    ensure(
      !(useWorker && options.adapters?.length),
      "Injected adapters require worker:false; Worker adapters must be bundled explicitly",
    );
    const transport = useWorker
      ? await WorkerClient.create(options)
      : await ApplicationHost.create(options);
    let store: ReportStore = new MemoryReportStore();
    if (options.storage !== "memory" && typeof indexedDB !== "undefined") {
      try {
        store = await IndexedDbReportStore.create();
      } catch {}
    }
    const lab = new Frameulator(transport, store);
    if (options.container && options.renderer !== "none") {
      try {
        lab.renderer = new FrameulatorRenderer(options.container);
        lab.renderer.setInputHandler((event) => {
          if (lab.applicationState !== "RUNNING") return;
          void lab
            .input(event)
            .catch((error) =>
              lab.emit("frameulator-error", { message: String(error) }),
            );
        });
      } catch (error) {
        await lab.destroy();
        throw error;
      }
    }
    return lab;
  }
  get applicationState() {
    return this._state;
  }
  private emit(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  private update(snapshot: LabSnapshot) {
    const previous = this._state;
    this._state = snapshot.application?.state ?? "EMPTY";
    const label =
      snapshot.application?.descriptor.name ?? "No application loaded";
    this.renderer?.update(snapshot);
    if (!snapshot.application) this.renderer?.clearApplicationFrame();
    if (previous !== this._state || label !== this.applicationLabel) {
      this.applicationLabel = label;
      this.emit("frameulator-application", {
        state: this._state,
        detail: label,
      });
    }
    this.emit("frameulator-frame", snapshot);
    return snapshot;
  }
  private async call(method: string, p?: unknown): Promise<LabSnapshot> {
    ensure(!this.closed, "Frameulator destroyed");
    if (method !== "snapshot") {
      this.reportEpoch++;
      await this.store.clearReport();
    }
    try {
      return this.update(await this.transport.request(method, p));
    } catch (error) {
      if (method === "loadApplication") {
        this._state = "FAILED";
        this.renderer?.clearApplicationFrame();
        this.emit("frameulator-application", {
          state: "FAILED",
          detail: String(error),
        });
      }
      if (method !== "loadApplication" && method !== "snapshot") {
        try {
          this.update(await this.transport.request("snapshot"));
        } catch {
          this._state = "FAILED";
          this.renderer?.clearApplicationFrame();
        }
      }
      throw error;
    }
  }
  async loadApplication(selection: ApplicationSelection) {
    this.pauseClock();
    this.renderer?.clearApplicationFrame();
    await this.store.clear();
    return this.call("loadApplication", selection);
  }
  async start() {
    const generation = this.generation;
    const result = await this.call("start");
    if (generation === this.generation && !this.closed) {
      this.running = true;
      this.previous = 0;
      this.schedule();
    }
    return result;
  }
  async stop() {
    this.pauseClock();
    return this.call("stop");
  }
  async reset() {
    this.pauseClock();
    this.renderer?.clearApplicationFrame();
    await this.store.clear();
    return this.call("reset");
  }
  async removeApplication() {
    this.pauseClock();
    await this.store.clear();
    return this.call("removeApplication");
  }
  async step(milliseconds: number) {
    return this.call("step", milliseconds);
  }
  async input(event: SurfacePointerInput) {
    return this.call("input", event);
  }
  async action(name: string, payload: Record<string, unknown> = {}) {
    return this.call("action", { name, payload });
  }
  async snapshot(): Promise<LabSnapshot> {
    return this.call("snapshot");
  }
  async setHeadPose(pose: Pose) {
    return this.call("setHeadPose", pose);
  }
  async setControllerState(hand: "left" | "right", state: ControllerState) {
    return this.call("setControllerState", { hand, state });
  }
  async injectEvent(event: FrameulatorEvent) {
    return this.call("injectEvent", event);
  }
  async runScenario(scenario: Scenario | string): Promise<ApplicationReport> {
    ensure(!this.closed, "Frameulator destroyed");
    this.pauseClock();
    const epoch = ++this.reportEpoch;
    await this.store.clearReport();
    const report = await this.transport.request("runScenario", scenario);
    if (epoch === this.reportEpoch) await this.store.save(report);
    return report;
  }
  async exportReport(): Promise<ApplicationReport> {
    ensure(!this.closed, "Frameulator destroyed");
    const epoch = this.reportEpoch;
    await this.store.clearReport();
    const report = await this.transport.request("exportReport");
    if (epoch === this.reportEpoch) await this.store.save(report);
    return report;
  }
  async latestReport() {
    const report = await this.store.latest();
    return report?.schemaVersion === 3 ? report : undefined;
  }
  async importEvidence(value: NativeEvidence) {
    const e = boundedJson(value);
    ensure(
      e.simulated === false &&
        [
          "F3-native-vulkan",
          "F4-native-openxr",
          "F5-arm64-flatpak",
          "F6-device",
        ].includes(e.evidenceLevel) &&
        typeof e.producer === "string" &&
        e.producer.length > 0 &&
        typeof e.scenario === "string" &&
        typeof e.passed === "boolean" &&
        Number.isFinite(Date.parse(e.generatedAt)),
      "Invalid native evidence",
    );
    await this.store.saveNative(e);
    return e;
  }
  async latestNativeEvidence() {
    return this.store.latestNative();
  }
  compareEvidence({
    simulation,
    native,
  }: {
    simulation: {
      scenario: string;
      passed: boolean;
      evidenceLevel: "F1-browser-wasm";
    };
    native: NativeEvidence;
  }): EvidenceComparison {
    const sameScenario = simulation.scenario === native.scenario;
    return {
      comparable: sameScenario,
      sameScenario,
      simulationPassed: simulation.passed,
      nativePassed: native.passed,
      simulationLevel: simulation.evidenceLevel,
      nativeLevel: native.evidenceLevel,
      note: "Imported evidence is separate; browser simulation does not establish native execution.",
    };
  }
  setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement) {
    this.renderer?.setEyePreviews(left, right);
  }
  private pauseClock() {
    this.generation++;
    this.running = false;
    if (typeof cancelAnimationFrame === "function")
      cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
  private schedule() {
    if (
      this.running &&
      !this.closed &&
      typeof requestAnimationFrame === "function"
    )
      this.frame = requestAnimationFrame(async (time) => {
        if (!this.running || this.closed) return;
        const delta = this.previous
          ? Math.min(1000, Math.max(0, time - this.previous))
          : 0;
        this.previous = time;
        try {
          await this.step(delta);
        } catch (error) {
          this.pauseClock();
          this.emit("frameulator-error", { message: String(error) });
        }
        this.schedule();
      });
  }
  async destroy() {
    if (this.closed) return;
    this.pauseClock();
    try {
      await this.transport.request("destroy");
    } finally {
      this.closed = true;
      if (this.transport instanceof WorkerClient) this.transport.destroy();
      this.renderer?.destroy();
      this.store.close();
    }
  }
}
