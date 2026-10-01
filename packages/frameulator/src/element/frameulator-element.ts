import { Frameulator } from "../Frameulator";
import { SteamFrameProfile } from "../profile";
import type { RenderSurface, SurfacePointerInput } from "../renderer/FrameulatorRenderer";
import styles from "../styles.css";

const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;
type InspectorTab = "application" | "device" | "evidence" | "logs";
interface WorkbenchSnapshot {
  sessionState: string;
  frameCount?: number;
  application?: {
    state: string;
    adapterId?: string;
    descriptor: { id: string; name: string; version: string };
    data: unknown;
    surfaces: RenderSurface[];
  };
}
interface SurfacePreview {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  label: HTMLElement;
  surface: RenderSurface;
  revision: number;
  pointerId?: number;
  lastInput?: SurfacePointerInput;
}

/** A neutral example UI. Embedders can use `frameulator` after ready to load an adapter. */
export class FrameulatorElement extends HTMLElementBase {
  private lab?: Frameulator;
  private initialized = false;
  private generation = 0;
  private bindings?: AbortController;
  private busy = false;
  private applicationState = "EMPTY";
  private activeTab: InspectorTab = "application";
  private currentSnapshot?: WorkbenchSnapshot;
  private lastInspection = 0;
  private logEntries: string[] = [];
  private lastLifecycleLog = "";
  private previews = new Map<string, SurfacePreview>();

  get frameulator(): Frameulator | undefined { return this.lab; }

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialized = true;
    const generation = ++this.generation;
    this.mount(generation).catch((error) => {
      if (generation === this.generation) this.showError(error);
    });
  }

  disconnectedCallback(): void {
    ++this.generation;
    this.bindings?.abort();
    this.lab?.destroy().catch(() => undefined);
    this.lab = undefined;
    this.previews.clear();
    this.initialized = false;
    this.applicationState = "EMPTY";
    this.currentSnapshot = undefined;
    this.lastLifecycleLog = "";
    this.busy = false;
  }

  private async mount(generation: number): Promise<void> {
    this.activeTab = "application";
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.bindings = new AbortController();
    const signal = this.bindings.signal;
    root.innerHTML = `
      <style>${styles}</style>
      <section class="frameulator-shell" aria-label="Frameulator application workbench" aria-busy="true">
        <header class="frameulator-topbar">
          <div class="frameulator-brand"><span class="frameulator-mark" aria-hidden="true">F</span><div><strong>Frameulator</strong><small>APPLICATION WORKBENCH</small></div></div>
          <span class="simulation-badge">BROWSER SIMULATION</span>
          <div class="frameulator-global-actions">
            <button type="button" data-action="sample" disabled>Load sample</button>
            <button type="button" class="primary" data-action="start" disabled>Start</button>
            <button type="button" data-action="stop" disabled>Stop</button>
            <button type="button" data-action="export" disabled>Export report</button>
          </div>
        </header>
        <main class="frameulator-main">
          <section class="frameulator-visuals" aria-label="Simulation and adapter surfaces">
            <div class="section-heading"><div><span class="eyebrow">01 / SIMULATION</span><h1>Application space</h1></div><span class="state-chip" data-session-state>IDLE</span></div>
            <div class="frameulator-stage" aria-label="Three-dimensional simulated device">
              <div class="frameulator-viewport-hud"><span>STEAM FRAME PROFILE</span><span data-frame-count>0 FRAMES</span></div>
              <div class="frameulator-empty" data-empty>
                <span class="empty-symbol" aria-hidden="true">＋</span>
                <h2>A space for your application</h2>
                <p>Load the neutral sample to explore lifecycle, surface output and input.</p>
                <button type="button" class="primary" data-action="sample" disabled>Load sample panel</button>
              </div>
              <div class="frameulator-eye-dock" aria-label="Simulated scene eye previews">
                <figure><canvas width="180" height="132" data-eye="left" aria-label="Simulated scene left eye"></canvas><figcaption>SIMULATED · LEFT</figcaption></figure>
                <figure><canvas width="180" height="132" data-eye="right" aria-label="Simulated scene right eye"></canvas><figcaption>SIMULATED · RIGHT</figcaption></figure>
              </div>
            </div>
            <section class="frameulator-surfaces" aria-label="Adapter RGBA surfaces">
              <div class="surface-heading"><div><span class="eyebrow">02 / ADAPTER OUTPUT</span><h2>Surface inspector <span data-surface-count>0</span></h2></div><span class="surface-help">RGBA · TOP-LEFT ORIGIN</span></div>
              <p class="surface-placeholder" data-surface-placeholder>No surfaces yet. Adapter pixel output will appear here.</p>
              <div class="surface-list" data-surfaces></div>
              <output class="pixel-readout" data-pixel-readout>Point at a surface to inspect pixels. Click to send normalized input.</output>
            </section>
          </section>
          <aside class="frameulator-inspector" aria-label="Application inspector">
            <header><div><span class="eyebrow">INSPECTOR</span><h2 data-application-name>No application</h2></div><span class="state-chip" data-application-state>EMPTY</span></header>
            <div class="frameulator-tabs" role="tablist" aria-label="Inspector views">
              <button type="button" id="tab-application" role="tab" aria-controls="panel-application" aria-selected="true" data-tab="application">App</button>
              <button type="button" id="tab-device" role="tab" aria-controls="panel-device" aria-selected="false" tabindex="-1" data-tab="device">Device</button>
              <button type="button" id="tab-evidence" role="tab" aria-controls="panel-evidence" aria-selected="false" tabindex="-1" data-tab="evidence">Evidence</button>
              <button type="button" id="tab-logs" role="tab" aria-controls="panel-logs" aria-selected="false" tabindex="-1" data-tab="logs">Log</button>
            </div>
            <div class="frameulator-inspector-body">
              <section id="panel-application" role="tabpanel" aria-labelledby="tab-application" data-panel="application">
                <p class="section-note">Registered adapters own application behavior. Frameulator supplies the simulated device, lifecycle and inspection tools.</p>
                <dl><div><dt>Application ID</dt><dd data-app-id>—</dd></div><div><dt>Version</dt><dd data-app-version>—</dd></div><div><dt>Lifecycle</dt><dd data-app-lifecycle>EMPTY</dd></div><div><dt>Surface count</dt><dd data-app-surfaces>0</dd></div></dl>
                <div class="action-grid"><button type="button" data-action="reset" disabled>Reset</button><button type="button" data-action="remove" disabled>Remove</button></div>
                <button type="button" class="sample-action" data-action="advance" disabled>Advance sample color <span aria-hidden="true">↗</span></button>
                <h3>Application data</h3><pre class="code-inspector" data-app-data aria-label="Application state JSON">No application loaded</pre>
              </section>
              <section id="panel-device" role="tabpanel" aria-labelledby="tab-device" data-panel="device" hidden>
                <p class="section-note">A browser-side model for repeatable inspection. It does not execute a native package or establish device compatibility.</p>
                <dl><div><dt>Profile</dt><dd>Steam Frame</dd></div><div><dt>Architecture model</dt><dd>${SteamFrameProfile.hardware.architecture}</dd></div><div><dt>Eye resolution model</dt><dd>${SteamFrameProfile.display.eyeWidth} × ${SteamFrameProfile.display.eyeHeight}</dd></div><div><dt>Refresh model</dt><dd>${SteamFrameProfile.display.defaultRefreshRateHz} Hz</dd></div><div><dt>Runtime model</dt><dd>${SteamFrameProfile.openxr.apiVersion}</dd></div></dl>
                <p class="boundary-note">The main view and eye previews visualize the device model. The surface inspector shows the adapter’s actual RGBA output.</p>
              </section>
              <section id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence" data-panel="evidence" hidden>
                <div class="evidence-label">SIMULATION ONLY</div><h3>Inspectable, bounded evidence</h3>
                <p class="section-note">Export a JSON report of the current simulated run. Native execution, operating-system behavior and physical hardware require separate validation.</p>
                <button type="button" data-action="export" disabled>Export current report</button>
                <pre class="code-inspector" data-report aria-label="Exported report preview">No report exported</pre>
              </section>
              <section id="panel-logs" role="tabpanel" aria-labelledby="tab-logs" data-panel="logs" hidden><pre class="frameulator-logs" role="log" aria-live="polite"></pre></section>
            </div>
            <footer class="inspector-footer"><span aria-hidden="true">◇</span> Application-neutral adapter contract</footer>
          </aside>
        </main>
        <footer class="frameulator-statusbar"><span class="status-light" data-status-light></span><span role="status" aria-live="polite" data-status>Initializing workbench…</span><span data-version></span></footer>
      </section>`;

    root.addEventListener("click", this.handleClick, { signal });
    root.addEventListener("keydown", this.handleKeyDown as EventListener, { signal });
    const stage = root.querySelector<HTMLElement>(".frameulator-stage")!;
    let lab: Frameulator;
    try {
      lab = await Frameulator.create({ container: stage, profile: "steam-frame", renderer: "auto", storage: "memory", network: "disabled", worker: false });
    } catch (error) {
      // Surface inspection and lifecycle remain usable if this browser has no WebGL.
      stage.querySelectorAll(":scope > canvas").forEach((canvas) => canvas.remove());
      lab = await Frameulator.create({ profile: "steam-frame", renderer: "none", storage: "memory", network: "disabled", worker: false });
      stage.dataset.renderer = "unavailable";
      this.appendLog(`3D preview unavailable: ${error instanceof Error ? error.message : String(error)}`);
      this.setText(".frameulator-viewport-hud span", "3D PREVIEW UNAVAILABLE · SURFACE INSPECTION ACTIVE");
    }
    if (generation !== this.generation) { await lab.destroy(); return; }
    this.lab = lab;
    const left = root.querySelector<HTMLCanvasElement>('[data-eye="left"]')!;
    const right = root.querySelector<HTMLCanvasElement>('[data-eye="right"]')!;
    lab.setEyePreviews(left, right);
    this.forwardEvents(lab, signal);
    await this.refresh();
    this.setText("[data-version]", `v${lab.version} · SIMULATED`);
    this.setText("[data-status]", "Ready · load an application adapter to begin");
    this.appendLog("Workbench ready. No application loaded.");
    root.querySelector(".frameulator-shell")?.setAttribute("aria-busy", "false");
    this.syncControls();
    this.dispatch("frameulator-ready", { version: lab.version, simulated: true, applicationState: "EMPTY" });
  }

  private forwardEvents(lab: Frameulator, signal: AbortSignal): void {
    for (const type of ["frameulator-frame", "frameulator-state", "frameulator-application", "frameulator-error", "frameulator-result"]) {
      lab.addEventListener(type, ((event: CustomEvent) => {
        if (type === "frameulator-frame") this.renderSnapshot(event.detail as WorkbenchSnapshot);
        if (type === "frameulator-state" && event.detail?.sessionState) this.renderSnapshot(event.detail as WorkbenchSnapshot);
        if (type === "frameulator-application") {
          this.applicationState = event.detail.state;
          const lifecycleLog = `${event.detail.state}${event.detail.detail ? ` · ${event.detail.detail}` : ""}`;
          if (lifecycleLog !== this.lastLifecycleLog) this.appendLog(lifecycleLog);
          this.lastLifecycleLog = lifecycleLog;
          this.syncControls();
        }
        if (type === "frameulator-error") this.showError(event.detail?.message ?? "Application error", false);
        this.dispatch(type, event.detail);
      }) as EventListener, { signal });
    }
  }

  private handleClick = (event: Event): void => {
    const target = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!target || target.disabled) return;
    if (target.dataset.tab) { this.selectTab(target.dataset.tab as InspectorTab); return; }
    const action = target.dataset.action;
    if (action) void this.perform(action);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-tab]");
    if (button && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs: InspectorTab[] = ["application", "device", "evidence", "logs"];
      const index = tabs.indexOf(this.activeTab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      this.selectTab(tabs[next]);
      this.shadowRoot?.querySelector<HTMLButtonElement>(`[data-tab="${tabs[next]}"]`)?.focus();
      event.preventDefault();
    }
    if (event.key === "Escape" && this.applicationState === "RUNNING" && !this.busy) void this.perform("stop");
  };

  private async perform(action: string): Promise<void> {
    if (!this.lab || this.busy) return;
    const lab = this.lab;
    const generation = this.generation;
    this.busy = true;
    this.syncControls();
    try {
      switch (action) {
        case "sample": await lab.loadApplication({ adapterId: "neutral-panel", manifest: { id: "sample-panel", name: "Sample panel", version: "1.0.0" }, config: {} }); break;
        case "start": await lab.start(); break;
        case "stop": await lab.stop(); break;
        case "reset": await lab.reset(); break;
        case "remove": await lab.removeApplication(); break;
        case "advance": await lab.action("sample.advance"); break;
        case "export": await this.downloadReport(); break;
        default: return;
      }
      if (generation !== this.generation) return;
      await this.refresh();
      this.setText("[data-status]", action === "export" ? "Report exported · simulation evidence only" : `${this.applicationState} · ${this.currentSnapshot?.application?.descriptor.name ?? "no application loaded"}`);
      this.appendLog(`Completed: ${action}`);
    } catch (error) {
      if (generation === this.generation) this.showError(error);
    } finally {
      if (generation === this.generation) { this.busy = false; this.syncControls(); }
    }
  }

  private async refresh(): Promise<void> {
    if (!this.lab) return;
    const lab = this.lab;
    const generation = this.generation;
    const snapshot = await lab.snapshot() as WorkbenchSnapshot;
    if (lab === this.lab && generation === this.generation) this.renderSnapshot(snapshot, true);
  }

  private renderSnapshot(snapshot: WorkbenchSnapshot, force = false): void {
    if (!snapshot || !this.lab) return;
    this.currentSnapshot = snapshot;
    const application = snapshot.application;
    this.applicationState = application?.state ?? "EMPTY";
    if (this.applicationState !== "RUNNING") {
      for (const preview of this.previews.values()) {
        const pointerId = preview.pointerId;
        preview.pointerId = undefined;
        preview.lastInput = undefined;
        if (pointerId !== undefined && preview.canvas.hasPointerCapture(pointerId)) preview.canvas.releasePointerCapture(pointerId);
      }
    }
    this.setText("[data-session-state]", snapshot.sessionState ?? "IDLE");
    this.setText("[data-frame-count]", `${snapshot.frameCount ?? 0} FRAMES`);
    this.renderSurfaces(application?.surfaces ?? []);
    const empty = this.shadowRoot?.querySelector<HTMLElement>("[data-empty]");
    if (empty) empty.hidden = Boolean(application);
    this.syncControls();
    const now = performance.now();
    if (!force && now - this.lastInspection < 120) return;
    this.lastInspection = now;
    this.setText("[data-application-name]", application?.descriptor.name ?? "No application");
    this.setText("[data-application-state]", this.applicationState);
    this.setText("[data-app-id]", application?.descriptor.id ?? "—");
    this.setText("[data-app-version]", application?.descriptor.version ?? "—");
    this.setText("[data-app-lifecycle]", this.applicationState);
    this.setText("[data-app-surfaces]", String(application?.surfaces.length ?? 0));
    this.setText("[data-app-data]", application ? JSON.stringify(application.data, null, 2) ?? "null" : "No application loaded");
  }

  private renderSurfaces(surfaces: RenderSurface[]): void {
    const list = this.shadowRoot?.querySelector<HTMLElement>("[data-surfaces]");
    if (!list) return;
    const ids = new Set(surfaces.map((surface) => surface.id));
    for (const [id, preview] of this.previews) {
      if (!ids.has(id)) { preview.element.remove(); this.previews.delete(id); }
    }
    for (const surface of surfaces) {
      let preview = this.previews.get(surface.id);
      if (!preview) {
        const element = this.ownerDocument.createElement("figure");
        element.className = "surface-card";
        const label = this.ownerDocument.createElement("figcaption");
        const canvas = this.ownerDocument.createElement("canvas");
        canvas.setAttribute("aria-label", `RGBA surface ${surface.id}. Click to send pointer input.`);
        element.append(canvas, label);
        list.append(element);
        preview = { element, canvas, label, surface, revision: -1 };
        this.previews.set(surface.id, preview);
        const boundPreview = preview;
        for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
          canvas.addEventListener(type, (event) => this.handleSurfacePointer(event as PointerEvent, boundPreview), { signal: this.bindings!.signal });
        }
      }
      const resized = preview.canvas.width !== surface.width || preview.canvas.height !== surface.height;
      preview.surface = surface;
      preview.label.textContent = `${surface.id} · ${surface.width} × ${surface.height} · rev ${surface.revision}${surface.visible === false ? " · hidden in scene" : ""}`;
      if (resized || preview.revision !== surface.revision) {
        if (resized) { preview.canvas.width = surface.width; preview.canvas.height = surface.height; }
        const context = preview.canvas.getContext("2d");
        if (context) {
          const pixels = context.createImageData(surface.width, surface.height);
          pixels.data.set(surface.rgba);
          context.putImageData(pixels, 0, 0);
        }
        preview.revision = surface.revision;
      }
    }
    this.setText("[data-surface-count]", String(surfaces.length));
    const placeholder = this.shadowRoot?.querySelector<HTMLElement>("[data-surface-placeholder]");
    if (placeholder) placeholder.hidden = surfaces.length > 0;
    if (surfaces.length === 0) this.setText("[data-pixel-readout]", "Point at a surface to inspect pixels. Click to send normalized input.");
  }

  private handleSurfacePointer(event: PointerEvent, preview: SurfacePreview): void {
    if (preview.pointerId !== undefined && event.pointerId !== preview.pointerId) return;
    if (event.type === "lostpointercapture" && preview.pointerId === undefined) return;
    const bounds = preview.canvas.getBoundingClientRect();
    const rawX = (event.clientX - bounds.left) / bounds.width;
    const rawY = (event.clientY - bounds.top) / bounds.height;
    const outside = rawX < 0 || rawX > 1 || rawY < 0 || rawY > 1;
    const x = Math.max(0, Math.min(1, rawX));
    const y = Math.max(0, Math.min(1, rawY));
    const px = Math.min(preview.surface.width - 1, Math.floor(x * preview.surface.width));
    const py = Math.min(preview.surface.height - 1, Math.floor(y * preview.surface.height));
    const offset = (py * preview.surface.width + px) * 4;
    const rgba = Array.from(preview.surface.rgba.subarray(offset, offset + 4));
    this.setText("[data-pixel-readout]", `${preview.surface.id} · (${px}, ${py}) · RGBA ${rgba.join(", ")} · normalized ${x.toFixed(3)}, ${y.toFixed(3)}`);
    const phase = event.type === "pointerdown" ? "down" : event.type === "pointerup" ? (outside ? "cancel" : "up") : event.type === "pointermove" ? "move" : "cancel";
    if (!this.lab || this.busy || this.applicationState !== "RUNNING") {
      if (phase === "up" || phase === "cancel") {
        preview.pointerId = undefined;
        preview.lastInput = undefined;
        if (preview.canvas.hasPointerCapture(event.pointerId)) preview.canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const button = phase === "move" ? (preview.pointerId !== undefined ? preview.lastInput?.button ?? 0 : 0) : event.button;
    const input: SurfacePointerInput = phase === "cancel" && preview.lastInput ? { ...preview.lastInput, phase } : { type: "pointer", surfaceId: preview.surface.id, phase, x, y, button };
    if (phase === "down") {
      event.preventDefault();
      preview.pointerId = event.pointerId;
      preview.canvas.setPointerCapture(event.pointerId);
    }
    preview.lastInput = input;
    if (phase === "up" || phase === "cancel") {
      preview.pointerId = undefined;
      if (preview.canvas.hasPointerCapture(event.pointerId)) preview.canvas.releasePointerCapture(event.pointerId);
    }
    void this.lab.input(input).then(() => this.refresh()).catch((error) => this.showError(error));
  }

  private syncControls(): void {
    const loaded = Boolean(this.currentSnapshot?.application);
    const running = this.applicationState === "RUNNING";
    const disabled: Record<string, boolean> = {
      sample: loaded, start: !loaded || running || this.applicationState === "FAILED", stop: !running,
      reset: !loaded, remove: !loaded, advance: !running || this.currentSnapshot?.application?.adapterId !== "neutral-panel", export: !loaded,
    };
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
      button.disabled = !this.lab || this.busy || Boolean(disabled[button.dataset.action!]);
    });
    const advance = this.shadowRoot?.querySelector<HTMLElement>('[data-action="advance"]');
    if (advance) advance.hidden = loaded && this.currentSnapshot?.application?.adapterId !== "neutral-panel";
    const light = this.shadowRoot?.querySelector<HTMLElement>("[data-status-light]");
    if (light) light.dataset.state = running ? "running" : loaded ? "ready" : "empty";
    this.shadowRoot?.querySelector(".frameulator-shell")?.setAttribute("aria-busy", String(!this.lab || this.busy));
  }

  private selectTab(tab: InspectorTab): void {
    this.activeTab = tab;
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.tab === tab));
      button.tabIndex = button.dataset.tab === tab ? 0 : -1;
    });
    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
  }

  private async downloadReport(): Promise<void> {
    if (!this.lab) return;
    const report = await this.lab.exportReport();
    const json = JSON.stringify(report, null, 2);
    this.setText("[data-report]", json);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const anchor = this.ownerDocument.createElement("a");
    anchor.href = url;
    anchor.download = "frameulator-simulation-report.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.selectTab("evidence");
  }

  private showError(error: unknown, forward = true): void {
    const message = error instanceof Error ? error.message : String(error);
    this.setText("[data-status]", `Error · ${message}`);
    this.appendLog(`ERROR · ${message}`);
    if (forward) this.dispatch("frameulator-error", { message });
  }

  private appendLog(message: string): void {
    this.logEntries.push(`${new Date().toLocaleTimeString([], { hour12: false })}  ${message}`);
    this.logEntries = this.logEntries.slice(-80);
    this.setText(".frameulator-logs", this.logEntries.join("\n"));
  }

  private setText(selector: string, value: string): void {
    const element = this.shadowRoot?.querySelector<HTMLElement>(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }

  private dispatch(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

export function defineFrameulatorElement(tagName = "frameulator-lab"): void {
  if (!("customElements" in globalThis)) return;
  if (!customElements.get(tagName)) customElements.define(tagName, FrameulatorElement);
}
