import { FrameulatorKernel } from "../FrameulatorKernel";
import type { FrameulatorOptions, Scenario, ScenarioStep } from "../types";
import { NeutralPanelAdapter } from "./NeutralPanel";
import {
  boundedJson,
  ensure,
  identifier,
  validateSnapshot,
  type ApplicationAdapter,
  type ApplicationAdapterFactory,
  type ApplicationSelection,
  type ApplicationSnapshot,
  type ApplicationReport,
  type LabSnapshot,
  type SurfacePointerInput,
} from "./contracts";
import { sha256Bytes } from "./hash";

/** Serialized per-instance dispatcher shared by local and Worker transports. */
export class ApplicationHost {
  private readonly factories = new Map<string, ApplicationAdapterFactory>();
  private adapter?: ApplicationAdapter;
  private selection?: ApplicationSelection;
  private factory?: ApplicationAdapterFactory;
  private state: ApplicationSnapshot["state"] = "EMPTY";
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private events: Array<{
    sequence: number;
    method: string;
    parameters?: unknown;
  }> = [];
  private sequence = 0;
  private executed = false;
  private report?: ApplicationReport;
  private constructor(
    private readonly kernel: FrameulatorKernel,
    adapters: ApplicationAdapterFactory[],
  ) {
    for (const factory of [NeutralPanelAdapter, ...adapters]) {
      identifier(factory.id);
      ensure(!this.factories.has(factory.id), "Duplicate adapter ID");
      ensure(typeof factory.create === "function", "Adapter factory required");
      ensure(
        /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(factory.version),
        "Invalid adapter version",
      );
      ensure(
        factory.source &&
          (factory.source.kind === "builtin" ||
            factory.source.kind === "source"),
        "Adapter source required",
      );
      if (factory.source.kind === "source")
        ensure(
          typeof factory.source.repository === "string" &&
            factory.source.repository.length <= 256 &&
            /^[a-f0-9]{40}$/.test(factory.source.commit),
          "Pinned adapter source required",
        );
      this.factories.set(factory.id, factory);
    }
  }
  static async create(options: FrameulatorOptions = {}) {
    return new ApplicationHost(
      await FrameulatorKernel.create(options),
      options.adapters ?? [],
    );
  }
  request(method: string, parameters?: unknown): Promise<any> {
    // Snapshot incoming data now, not after earlier queued work mutates caller-owned objects.
    const input =
      parameters === undefined ? undefined : structuredClone(parameters);
    const job = this.queue.then(async () => {
      ensure(!this.closed, "Application host destroyed");
      const result = await this.dispatch(method, input);
      return result;
    });
    this.queue = job.catch(() => {});
    return job;
  }
  private active() {
    ensure(
      this.adapter && this.selection && this.factory,
      "APPLICATION_REQUIRED: load a registered application",
    );
    return this.adapter;
  }
  private async clear() {
    const old = this.adapter;
    this.adapter = undefined;
    this.selection = undefined;
    this.factory = undefined;
    this.state = "EMPTY";
    this.executed = false;
    this.report = undefined;
    this.events = [];
    this.sequence = 0;
    this.kernel.reset();
    await old?.dispose();
  }
  private record(method: string, parameters?: unknown) {
    this.events.push({
      sequence: ++this.sequence,
      method,
      ...(parameters === undefined
        ? {}
        : { parameters: boundedJson(parameters, 4096) }),
    });
    if (this.events.length > 256) this.events.shift();
    this.report = undefined;
  }
  private async snapshot(): Promise<LabSnapshot> {
    const base = this.kernel.snapshot;
    let application: ApplicationSnapshot | undefined;
    if (this.adapter && this.selection && this.factory) {
      const frame = validateSnapshot(await this.adapter.snapshot());
      application = {
        ...frame,
        state: this.state,
        descriptor: structuredClone(this.selection.manifest),
        adapterId: this.factory.id,
        adapterVersion: this.factory.version,
        source: structuredClone(this.factory.source),
      };
    }
    return {
      ...base,
      application,
      applicationFrame: application
        ? { data: application.data, surfaces: application.surfaces }
        : undefined,
    };
  }
  private async dispatch(method: string, p: any): Promise<unknown> {
    // Revoke cached success before any attempted state-changing operation, including failures.
    if (!["snapshot", "exportReport"].includes(method)) this.report = undefined;
    switch (method) {
      case "snapshot":
        return this.snapshot();
      case "loadApplication": {
        await this.clear();
        try {
          const selection = boundedJson(p) as ApplicationSelection;
          identifier(selection.adapterId);
          ensure(
            selection.manifest && typeof selection.manifest === "object",
            "Manifest required",
          );
          identifier(selection.manifest.id);
          ensure(
            typeof selection.manifest.name === "string" &&
              selection.manifest.name.length > 0 &&
              selection.manifest.name.length <= 200,
            "Invalid application name",
          );
          ensure(
            /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(selection.manifest.version),
            "Invalid application version",
          );
          const factory = this.factories.get(selection.adapterId);
          ensure(
            factory,
            "Unknown adapter: arbitrary code loading is disabled",
          );
          const adapter = await factory.create({
            manifest: structuredClone(selection.manifest),
            config: selection.config ?? {},
          });
          this.adapter = adapter;
          for (const name of [
            "start",
            "stop",
            "reset",
            "step",
            "input",
            "snapshot",
            "dispose",
          ])
            ensure(
              typeof (adapter as any)[name] === "function",
              `Adapter missing ${name}`,
            );
          this.selection = selection;
          this.factory = factory;
          this.state = "READY";
          this.record(method);
          return await this.snapshot();
        } catch (error) {
          try {
            await this.clear();
          } finally {
            this.state = "FAILED";
          }
          throw error;
        }
      }
      case "removeApplication":
        await this.clear();
        return this.snapshot();
      case "start": {
        const adapter = this.active();
        ensure(
          this.state === "READY" || this.state === "STOPPED",
          "Application is not ready to start",
        );
        try {
          await adapter.start();
          this.kernel.start();
          this.state = "RUNNING";
          this.executed = true;
          this.record(method);
          return await this.snapshot();
        } catch (e) {
          this.state = "FAILED";
          throw e;
        }
      }
      case "stop": {
        const adapter = this.active();
        ensure(this.state === "RUNNING", "Application is not running");
        try {
          await adapter.stop();
          this.kernel.stop();
          this.kernel.step(0);
          this.state = "STOPPED";
          this.record(method);
          return await this.snapshot();
        } catch (e) {
          this.state = "FAILED";
          throw e;
        }
      }
      case "reset": {
        const adapter = this.active();
        try {
          await adapter.reset();
          this.kernel.reset();
          this.state = "READY";
          this.executed = false;
          this.record(method);
          return await this.snapshot();
        } catch (e) {
          this.state = "FAILED";
          throw e;
        }
      }
      case "step": {
        const adapter = this.active();
        ensure(this.state === "RUNNING", "Application is not running");
        ensure(
          Number.isFinite(p) && p >= 0 && p <= 1000,
          "Frame step must be between 0 and 1000 milliseconds",
        );
        try {
          await adapter.step(p);
          this.kernel.step(p);
          this.record(method, p);
          return await this.snapshot();
        } catch (e) {
          this.state = "FAILED";
          throw e;
        }
      }
      case "input": {
        const adapter = this.active();
        ensure(this.state === "RUNNING", "Application is not running");
        const e = boundedJson(p, 4096) as SurfacePointerInput;
        ensure(
          e.type === "pointer" &&
            ["down", "move", "up", "cancel"].includes(e.phase),
          "Unsupported input",
        );
        identifier(e.surfaceId);
        ensure(
          Number.isFinite(e.x) &&
            e.x >= 0 &&
            e.x <= 1 &&
            Number.isFinite(e.y) &&
            e.y >= 0 &&
            e.y <= 1 &&
            Number.isSafeInteger(e.button) &&
            e.button >= 0 &&
            e.button <= 5,
          "Invalid pointer coordinates/button",
        );
        const snapshot = validateSnapshot(await adapter.snapshot());
        ensure(
          snapshot.surfaces.some(
            (s) => s.id === e.surfaceId && s.visible !== false,
          ),
          "Unknown or hidden input surface",
        );
        await adapter.input(e);
        this.record(method, e);
        return this.snapshot();
      }
      case "action": {
        const adapter = this.active();
        ensure(this.state === "RUNNING", "Application is not running");
        const args = boundedJson(p, 4096);
        identifier(args.name);
        ensure(adapter.action, "Actions unsupported by this adapter");
        await adapter.action(args.name, args.payload ?? {});
        this.record(method, args);
        return this.snapshot();
      }
      case "setHeadPose":
        this.kernel.setHeadPose(p);
        return this.snapshot();
      case "setControllerState":
        ensure(p.hand === "left" || p.hand === "right", "Invalid controller");
        this.kernel.setControllerState(p.hand, p.state);
        return this.snapshot();
      case "injectEvent":
        ensure(
          [
            "tracking-lost",
            "tracking-restored",
            "runtime-exit",
            "focus-lost",
          ].includes(p),
          "Unknown host event",
        );
        this.kernel.injectEvent(p);
        this.record(method);
        return this.snapshot();
      case "runScenario": {
        this.active();
        const host = await this.kernel.runScenario(p as Scenario | string);
        this.report = await this.makeReport(host.scenario, host);
        return structuredClone(this.report);
      }
      case "exportReport":
        return this.report
          ? structuredClone(this.report)
          : this.makeReport("interactive");
      case "destroy":
        try {
          await this.clear();
        } finally {
          this.closed = true;
        }
        return { destroyed: true };
      default:
        return this.kernel.call(method);
    }
  }
  private async makeReport(
    scenario: string,
    host?: import("../types").KernelScenarioReport,
  ): Promise<ApplicationReport> {
    const snapshot = await this.snapshot(),
      app = snapshot.application;
    return {
      schemaVersion: 3,
      frameulatorVersion: "0.3.0",
      scenario,
      profile: this.kernel.profile.id,
      simulated: true,
      evidenceLevel: "F1-browser-wasm",
      passed: Boolean(host?.passed && this.state !== "FAILED"),
      generatedAt: new Date().toISOString(),
      hostKernelExecuted: true,
      applicationExecuted: this.executed,
      applicationAssertionsChecked: false,
      nativeExecutionProven: false,
      hardwareProven: false,
      host,
      application: app
        ? {
            appId: app.descriptor.id,
            version: app.descriptor.version,
            adapterId: app.adapterId,
            adapterVersion: app.adapterVersion,
            source: app.source,
            executionMode: "trusted-js-adapter",
            trust: "host-injected",
            signatureVerified: false,
            state: app.state,
            manifestSha256: sha256Bytes(
              new TextEncoder().encode(
                JSON.stringify(this.selection!.manifest),
              ),
            ),
            config: structuredClone(this.selection!.config ?? {}),
            data: app.data,
            surfaces: app.surfaces.map((s) => ({
              id: s.id,
              width: s.width,
              height: s.height,
              revision: s.revision,
              sha256: sha256Bytes(s.rgba),
            })),
          }
        : undefined,
      events: structuredClone(this.events),
    };
  }
  destroy() {
    return this.request("destroy");
  }
}
