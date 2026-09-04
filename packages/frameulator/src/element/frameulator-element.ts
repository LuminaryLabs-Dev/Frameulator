import { Frameulator } from "../Frameulator";
import styles from "../styles.css";
import type { ApplicationState, ScenarioReport, ServiceName, ServiceStatus, TrustedReleaseKey } from "../types";

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
          <span class="frameulator-evidence">FLATPAK REQUIRED · F1/F2</span>
        </header>
        <div class="frameulator-stage">
          <span class="frameulator-reticle" aria-hidden="true"></span>
          <div class="frameulator-upload" data-upload-state="EMPTY">
            <input type="file" accept=".flatpak,application/vnd.flatpak" data-flatpak hidden />
            <p class="frameulator-label">Application gate</p>
            <strong>Upload Agora.flatpak</strong>
            <p>Your Flatpak remains in this browser. Nothing is uploaded to a remote server.</p>
            <button type="button" data-action="select">Select Flatpak</button>
            <progress value="0" max="1" hidden></progress>
            <span data-upload-detail>Select an approved, signed Agora release to begin.</span>
          </div>
        </div>
        <aside class="frameulator-panel">
          <p class="frameulator-label">Application</p>
          <div class="frameulator-state" role="status" aria-live="polite">EMPTY</div>
          <p class="frameulator-label">Scenario</p>
          <div class="frameulator-actions">
            <button type="button" data-action="run" disabled>Run normal session</button>
            <button type="button" data-action="loss" disabled>Lose tracking</button>
            <button type="button" data-action="recover" disabled>Restore</button>
            <button type="button" data-action="export" disabled>Export report</button>
            <button type="button" data-action="remove" disabled>Remove application</button>
          </div>
          <p class="frameulator-label">Service contracts</p>
          <div class="frameulator-services" aria-label="Simulated service status"></div>
          <p class="frameulator-label">Stereo framebuffer preview</p>
          <div class="frameulator-eyes">
            <div class="frameulator-eye"><canvas width="180" height="132" data-eye="left" aria-label="Left eye preview"></canvas></div>
            <div class="frameulator-eye"><canvas width="180" height="132" data-eye="right" aria-label="Right eye preview"></canvas></div>
          </div>
          <div class="frameulator-report">FLATPAK_REQUIRED · no application session is running.</div>
        </aside>
      </section>
    `;

    const stage = root.querySelector<HTMLElement>(".frameulator-stage");
    const left = root.querySelector<HTMLCanvasElement>('[data-eye="left"]');
    const right = root.querySelector<HTMLCanvasElement>('[data-eye="right"]');
    if (!stage || !left || !right) throw new Error("Unable to create the Frameulator interface.");

    const keyId = this.getAttribute("trusted-key-id");
    const publicKeyBase64 = this.getAttribute("trusted-public-key");
    const trustedReleaseKeys: TrustedReleaseKey[] = keyId && publicKeyBase64
      ? [{ id: keyId, algorithm: "Ed25519", publicKeyBase64 }]
      : [];
    const registry = this.getAttribute("release-registry") || undefined;
    this.lab = await Frameulator.create({
      container: stage,
      profile: "steam-frame",
      renderer: "auto",
      storage: "indexeddb",
      network: "disabled",
      worker: "inline",
      releaseRegistry: registry,
      trustedReleaseKeys,
    });
    this.lab.setEyePreviews(left, right);
    this.forwardEvents();
    await this.renderServices();
    this.bindControls();
    this.dispatch("frameulator-ready", { version: this.lab.version, simulated: true, applicationState: "EMPTY" });
  }

  private forwardEvents(): void {
    if (!this.lab) return;
    for (const type of ["frameulator-frame", "frameulator-state", "frameulator-result", "frameulator-error", "frameulator-application", "frameulator-flatpak-verified"]) {
      this.lab.addEventListener(type, ((event: CustomEvent) => {
        if (type === "frameulator-application") this.setApplicationState(event.detail.state, event.detail.detail, event.detail.progress);
        if (type === "frameulator-state") this.setState(event.detail.state ?? event.detail.sessionState ?? "UNKNOWN");
        this.dispatch(type, event.detail);
      }) as EventListener);
    }
  }

  private bindControls(): void {
    const root = this.shadowRoot;
    const input = root?.querySelector<HTMLInputElement>("[data-flatpak]");
    const upload = root?.querySelector<HTMLElement>(".frameulator-upload");
    root?.querySelector('[data-action="select"]')?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) this.selectFlatpak(file);
      input.value = "";
    });
    upload?.addEventListener("dragover", (event) => { event.preventDefault(); upload.dataset.dragging = "true"; });
    upload?.addEventListener("dragleave", () => { delete upload.dataset.dragging; });
    upload?.addEventListener("drop", (event) => {
      event.preventDefault();
      delete upload.dataset.dragging;
      const file = event.dataTransfer?.files[0];
      if (file) this.selectFlatpak(file);
    });
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
    root?.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
      this.lab?.removeApplication().catch((error) => this.showError(error));
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

  private selectFlatpak(file: File): void {
    this.lab?.selectFlatpak(file).catch((error) => this.showError(error));
  }

  private setApplicationState(state: ApplicationState, detail: string, progress?: number): void {
    this.setState(state);
    const upload = this.shadowRoot?.querySelector<HTMLElement>(".frameulator-upload");
    const detailElement = this.shadowRoot?.querySelector<HTMLElement>("[data-upload-detail]");
    const progressElement = this.shadowRoot?.querySelector<HTMLProgressElement>("progress");
    if (upload) upload.dataset.uploadState = state;
    if (detailElement) detailElement.textContent = detail;
    if (progressElement) {
      progressElement.hidden = state !== "HASHING";
      progressElement.value = progress ?? 0;
    }
    this.setDisabled("select", ["HASHING", "VERIFIED", "LOADING_CAPSULE"].includes(state));
    const ready = ["READY", "RUNNING", "STOPPED"].includes(state);
    this.setDisabled("run", !ready);
    this.setDisabled("loss", state !== "RUNNING");
    this.setDisabled("recover", state !== "RUNNING");
    this.setDisabled("remove", !ready && state !== "REJECTED" && state !== "FAILED");
    if (upload) upload.hidden = state === "RUNNING";
  }

  private setDisabled(action: string, disabled: boolean): void {
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (button) button.disabled = disabled;
  }

  private showReport(report: ScenarioReport): void {
    this.setState(report.sessionState);
    const element = this.shadowRoot?.querySelector<HTMLElement>(".frameulator-report");
    if (!element) return;
    element.dataset.passed = String(report.passed);
    this.setDisabled("export", false);
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
