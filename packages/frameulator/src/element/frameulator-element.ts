import { Frameulator } from "../Frameulator";
import styles from "../styles.css";
import type { ScenarioReport, ServiceName, ServiceStatus } from "../types";

const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;
const serviceOrder: ServiceName[] = [
  "hardware",
  "gpu",
  "vulkan",
  "openxr",
  "compositor",
  "firmware",
  "tracking",
  "controllers",
  "host",
];

export class FrameulatorElement extends HTMLElementBase {
  private lab?: Frameulator;
  private initialized = false;

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.mount().catch((error) => this.showError(error));
  }

  disconnectedCallback(): void {
    this.lab?.destroy().catch(() => undefined);
    this.lab = undefined;
    this.initialized = false;
  }

  private async mount(): Promise<void> {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${styles}</style>
      <section class="frameulator-shell" aria-label="Frameulator Steam Frame contract simulator">
        <header class="frameulator-bar">
          <span class="frameulator-mark" aria-hidden="true"></span>
          <span class="frameulator-title"><strong>Frameulator</strong><span>Steam Frame contract laboratory</span></span>
          <span class="frameulator-evidence">SIMULATED · F1</span>
        </header>
        <div class="frameulator-stage"><span class="frameulator-reticle" aria-hidden="true"></span></div>
        <aside class="frameulator-panel">
          <p class="frameulator-label">OpenXR session</p>
          <div class="frameulator-state" role="status" aria-live="polite">IDLE</div>
          <p class="frameulator-label">Scenario</p>
          <div class="frameulator-actions">
            <button type="button" data-action="run">Run normal session</button>
            <button type="button" data-action="loss">Lose tracking</button>
            <button type="button" data-action="recover">Restore</button>
            <button type="button" data-action="export">Export report</button>
          </div>
          <p class="frameulator-label">Service contracts</p>
          <div class="frameulator-services" aria-label="Simulated service status"></div>
          <p class="frameulator-label">Stereo framebuffer preview</p>
          <div class="frameulator-eyes">
            <div class="frameulator-eye"><canvas width="180" height="132" data-eye="left" aria-label="Left eye preview"></canvas></div>
            <div class="frameulator-eye"><canvas width="180" height="132" data-eye="right" aria-label="Right eye preview"></canvas></div>
          </div>
          <div class="frameulator-report">Ready to run a deterministic browser scenario.</div>
        </aside>
      </section>
    `;

    const stage = root.querySelector<HTMLElement>(".frameulator-stage");
    const left = root.querySelector<HTMLCanvasElement>('[data-eye="left"]');
    const right = root.querySelector<HTMLCanvasElement>('[data-eye="right"]');
    if (!stage || !left || !right) throw new Error("Unable to create the Frameulator interface.");

    this.lab = await Frameulator.create({
      container: stage,
      profile: "steam-frame",
      renderer: "auto",
      storage: "indexeddb",
      network: "disabled",
      worker: "inline",
    });
    this.lab.setEyePreviews(left, right);
    this.forwardEvents();
    await this.renderServices();
    this.bindControls();
    this.dispatch("frameulator-ready", { version: this.lab.version, simulated: true });
  }

  private forwardEvents(): void {
    if (!this.lab) return;
    for (const type of ["frameulator-frame", "frameulator-state", "frameulator-result", "frameulator-error"]) {
      this.lab.addEventListener(type, ((event: CustomEvent) => {
        if (type === "frameulator-state") this.setState(String(event.detail.state ?? "IDLE"));
        this.dispatch(type, event.detail);
      }) as EventListener);
    }
  }

  private bindControls(): void {
    const root = this.shadowRoot;
    root?.querySelector('[data-action="run"]')?.addEventListener("click", () => {
      const scenario = this.getAttribute("scenario") || "normal-session";
      this.lab?.runScenario(scenario).then((report) => this.showReport(report)).catch((error) => this.showError(error));
    });
    root?.querySelector('[data-action="loss"]')?.addEventListener("click", () => {
      this.lab?.injectEvent("tracking-lost").catch((error) => this.showError(error));
    });
    root?.querySelector('[data-action="recover"]')?.addEventListener("click", () => {
      this.lab?.injectEvent("tracking-restored").catch((error) => this.showError(error));
    });
    root?.querySelector('[data-action="export"]')?.addEventListener("click", () => {
      this.downloadReport().catch((error) => this.showError(error));
    });
  }

  private async renderServices(): Promise<void> {
    const statuses = await this.lab?.call("services.status") as Record<ServiceName, ServiceStatus> | undefined;
    const container = this.shadowRoot?.querySelector(".frameulator-services");
    if (!statuses || !container) return;
    container.innerHTML = serviceOrder.map((name) => (
      `<div class="frameulator-service"><span>${name}</span><span>${statuses[name].status}</span></div>`
    )).join("");
  }

  private setState(state: string): void {
    const element = this.shadowRoot?.querySelector(".frameulator-state");
    if (element) element.textContent = state;
  }

  private showReport(report: ScenarioReport): void {
    this.setState(report.sessionState);
    const element = this.shadowRoot?.querySelector<HTMLElement>(".frameulator-report");
    if (!element) return;
    element.dataset.passed = String(report.passed);
    element.textContent = report.passed
      ? `PASS · ${report.scenario} · ${report.frameCount} frames · F1 simulated`
      : `FAIL · ${report.scenario} · inspect exported assertions`;
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const element = this.shadowRoot?.querySelector<HTMLElement>(".frameulator-report");
    if (element) {
      element.dataset.passed = "false";
      element.textContent = `ERROR · ${message}`;
    }
    this.dispatch("frameulator-error", { message });
  }

  private async downloadReport(): Promise<void> {
    if (!this.lab) return;
    const report = await this.lab.exportReport();
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `frameulator-${report.scenario}.frameproof.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private dispatch(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

export function defineFrameulatorElement(tagName = "frameulator-lab"): void {
  if (!("customElements" in globalThis)) return;
  if (!customElements.get(tagName)) customElements.define(tagName, FrameulatorElement);
}
