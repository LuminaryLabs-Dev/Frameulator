import { Frameulator } from "../Frameulator";
import { SteamFrameProfile } from "../profile";
import styles from "../styles.css";
import { WorkspaceStore } from "../storage/WorkspaceStore";
import type {
  ApplicationState,
  FlatpakVerification,
  ManagementSnapshot,
  ScenarioReport,
  ServiceName,
  ServiceStatus,
  TrustedReleaseKey,
} from "../types";

const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;
const serviceOrder: ServiceName[] = [
  "hardware", "gpu", "vulkan", "openxr", "compositor", "firmware", "tracking", "controllers", "host",
];
const sections = ["package", "device", "deploy", "session", "tests", "evidence"] as const;
type WorkbenchSection = typeof sections[number];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

const emptyManagement: ManagementSnapshot = {
  protocol: "agora-management/2",
  deviceState: "OFFLINE",
  deploymentState: "ABSENT",
  applicationSessionState: "IDLE",
  testState: "NOT_RUN",
  projectState: "EMPTY",
  currentRelease: 0,
  previousRelease: 0,
  eventCount: 0,
  lastEvent: "RESET",
  events: [],
};

export class FrameulatorElement extends HTMLElementBase {
  private lab?: Frameulator;
  private initialized = false;
  private applicationState: ApplicationState = "EMPTY";
  private management: ManagementSnapshot = structuredClone(emptyManagement);
  private verification?: FlatpakVerification;
  private activeSection: WorkbenchSection = "package";
  private services?: Record<ServiceName, ServiceStatus>;
  private logEntries: string[] = [];
  private lastReport?: ScenarioReport;
  private readonly workspace = new WorkspaceStore();
  private gamepadFrame = 0;
  private gamepadButtons = new Set<number>();

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.mount().catch((error) => this.showError(error));
  }

  disconnectedCallback(): void {
    this.ownerDocument.removeEventListener("keydown", this.handleKeyDown);
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.gamepadFrame);
    this.lab?.destroy().catch(() => undefined);
    this.lab = undefined;
    this.initialized = false;
  }

  private async mount(): Promise<void> {
    this.activeSection = this.workspace.load()?.lastSection ?? "package";
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${styles}</style>
      <section class="frameulator-shell" aria-label="Frameulator Agora operator workbench">
        <header class="frameulator-topbar">
          <div class="frameulator-brand"><span class="frameulator-mark" aria-hidden="true"></span><strong>Frameulator</strong><span>0.2.0</span></div>
          <div class="frameulator-context" aria-label="Current target">
            <span><small>PACKAGE</small><strong data-top-package>None</strong></span>
            <span><small>DEVICE</small><strong data-top-device>Offline</strong></span>
            <span><small>PROOF</small><strong>F1/F2 simulation</strong></span>
          </div>
          <div class="frameulator-global-actions">
            <button type="button" data-action="select">Open Flatpak</button>
            <button type="button" class="primary" data-action="run" data-workbench-action="normal" disabled>Run test</button>
            <button type="button" class="danger" data-action="stop" data-workbench-action="stop" disabled>Stop</button>
            <button type="button" class="inspector-toggle" data-action="toggle-inspector" aria-label="Toggle inspector">Inspect</button>
          </div>
          <input type="file" accept=".flatpak,application/vnd.flatpak" data-flatpak hidden />
          <input type="file" accept=".json,.frameproof.json,application/json" data-evidence hidden />
        </header>

        <nav class="frameulator-rail" aria-label="Workbench sections">
          ${sections.map((section, index) => `
            <button type="button" data-section="${section}" ${section === this.activeSection ? 'aria-current="page"' : ""}>
              <span class="rail-index">0${index + 1}</span><span class="rail-label">${section}</span><i data-section-state="${section}"></i>
            </button>
          `).join("")}
        </nav>

        <main class="frameulator-stage" aria-label="Three-dimensional Steam Frame simulation">
          <div class="frameulator-viewport-hud">
            <span data-hud-session>SESSION · IDLE</span>
            <span data-hud-frames>0 FRAMES</span>
          </div>
          <div class="frameulator-upload" data-upload-state="EMPTY">
            <p class="frameulator-kicker">APPLICATION REQUIRED</p>
            <strong>Open Agora.flatpak</strong>
            <p>Verify an approved release locally, then rehearse it against the simulated Steam Frame.</p>
            <button type="button" class="primary" data-action="select">Select Flatpak</button>
            <progress value="0" max="1" hidden></progress>
            <span data-upload-detail>The file stays on this device. It is not uploaded.</span>
          </div>
          <div class="frameulator-eye-dock" aria-label="Stereo eye previews">
            <figure><figcaption>LEFT</figcaption><canvas width="180" height="132" data-eye="left" aria-label="Left eye preview"></canvas></figure>
            <figure><figcaption>RIGHT</figcaption><canvas width="180" height="132" data-eye="right" aria-label="Right eye preview"></canvas></figure>
          </div>
        </main>

        <aside class="frameulator-inspector" data-open="true" aria-label="Workbench inspector">
          <header><div><small>INSPECTOR</small><h2 data-inspector-title>Package</h2></div><span class="state-chip" data-inspector-state>EMPTY</span></header>
          <div class="frameulator-tabs" role="tablist" aria-label="Inspector views">
            <button type="button" role="tab" aria-selected="true" data-tab="inspect">Inspect</button>
            <button type="button" role="tab" aria-selected="false" data-tab="services">Services</button>
            <button type="button" role="tab" aria-selected="false" data-tab="logs">Logs</button>
            <button type="button" role="tab" aria-selected="false" data-tab="proof">Proof</button>
          </div>
          <div class="frameulator-inspector-body">
            <section role="tabpanel" data-panel="inspect">
              <div data-section-content></div>
            </section>
            <section role="tabpanel" data-panel="services" hidden>
              <div class="frameulator-services" aria-label="Simulated service status"></div>
            </section>
            <section role="tabpanel" data-panel="logs" hidden>
              <div class="frameulator-logs" role="log" aria-live="polite"></div>
            </section>
            <section role="tabpanel" data-panel="proof" hidden>
              <div class="proof-stack">
                <article data-proof-browser><span>Browser contract</span><strong>Waiting for a run</strong><small>F1/F2 · simulated</small></article>
                <article data-proof-native><span>Native Flatpak smoke</span><strong>Not imported</strong><small>Separate CI evidence</small></article>
                <article><span>Native Vulkan</span><strong>Not tested</strong><small>F3 required</small></article>
                <article><span>Native OpenXR</span><strong>Not tested</strong><small>F4 required</small></article>
                <article><span>ARM64 Flatpak</span><strong>Not tested</strong><small>F5 required</small></article>
                <article><span>Physical Frame</span><strong>Not tested</strong><small>F6 required</small></article>
              </div>
            </section>
          </div>
        </aside>

        <footer class="frameulator-statusbar">
          <span class="status-light" data-status-light></span>
          <span data-status role="status" aria-live="polite">Flatpak required</span>
          <span data-last-event>RESET</span>
          <span>LOCAL · NETWORK DISABLED</span>
        </footer>
      </section>
    `;

    const stage = root.querySelector<HTMLElement>(".frameulator-stage");
    const left = root.querySelector<HTMLCanvasElement>('[data-eye="left"]');
    const right = root.querySelector<HTMLCanvasElement>('[data-eye="right"]');
    if (!stage || !left || !right) throw new Error("Unable to create the Frameulator workbench.");

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
    if (this.getAttribute("release-configured") === "false") {
      this.setText("[data-upload-detail]", "No signed Agora 0.0.2 release is published yet. The Flatpak gate remains locked.");
      this.setText("[data-status]", "Flatpak required · signed release registry unavailable");
    }
    this.forwardEvents();
    this.services = await this.lab.call("services.status") as Record<ServiceName, ServiceStatus>;
    const previousReport = await this.lab.latestReport();
    if (previousReport) this.restoreReportSummary(previousReport);
    const previousNative = await this.lab.latestNativeEvidence();
    if (previousNative) this.restoreNativeSummary(previousNative);
    this.renderServices();
    this.bindControls();
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      this.gamepadFrame = requestAnimationFrame(this.pollGamepad);
    }
    const inspector = root.querySelector<HTMLElement>(".frameulator-inspector");
    if (inspector && matchMedia("(max-width: 820px)").matches) inspector.dataset.open = "false";
    this.renderSection();
    this.syncControls();
    this.dispatch("frameulator-ready", { version: this.lab.version, simulated: true, applicationState: "EMPTY" });
  }

  private forwardEvents(): void {
    if (!this.lab) return;
    const forwarded = [
      "frameulator-frame", "frameulator-state", "frameulator-result", "frameulator-error",
      "frameulator-application", "frameulator-flatpak-verified", "frameulator-management",
      "frameulator-device", "frameulator-deployment", "frameulator-session",
      "frameulator-package", "frameulator-log", "frameulator-evidence",
    ];
    for (const type of forwarded) {
      this.lab.addEventListener(type, ((event: CustomEvent) => {
        if (type === "frameulator-application") this.setApplicationState(event.detail.state, event.detail.detail, event.detail.progress);
        if (type === "frameulator-management") this.setManagement(event.detail);
        if (type === "frameulator-frame") this.updateFrameHud(event.detail.applicationFrame);
        if (type === "frameulator-result") this.showReport(event.detail);
        this.dispatch(type, event.detail);
      }) as EventListener);
    }
  }

  private bindControls(): void {
    const root = this.shadowRoot;
    const input = root?.querySelector<HTMLInputElement>("[data-flatpak]");
    const evidenceInput = root?.querySelector<HTMLInputElement>("[data-evidence]");
    const upload = root?.querySelector<HTMLElement>(".frameulator-upload");
    root?.querySelectorAll('[data-action="select"]').forEach((button) => button.addEventListener("click", () => input?.click()));
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) this.selectFlatpak(file);
      input.value = "";
    });
    evidenceInput?.addEventListener("change", () => {
      const file = evidenceInput.files?.[0];
      if (file) this.importEvidence(file).catch((error) => this.showError(error));
      evidenceInput.value = "";
    });
    upload?.addEventListener("dragover", (event) => { event.preventDefault(); upload.dataset.dragging = "true"; });
    upload?.addEventListener("dragleave", () => { delete upload.dataset.dragging; });
    upload?.addEventListener("drop", (event) => {
      event.preventDefault();
      delete upload.dataset.dragging;
      const file = event.dataTransfer?.files[0];
      if (file) this.selectFlatpak(file);
    });
    root?.querySelectorAll<HTMLElement>("[data-section]").forEach((button) => button.addEventListener("click", () => {
      this.selectSection(button.dataset.section as WorkbenchSection);
    }));
    root?.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => button.addEventListener("click", () => {
      this.selectInspectorTab(button.dataset.tab ?? "inspect");
    }));
    root?.querySelector('[data-action="toggle-inspector"]')?.addEventListener("click", () => {
      const inspector = root.querySelector<HTMLElement>(".frameulator-inspector");
      if (inspector) inspector.dataset.open = String(inspector.dataset.open !== "true");
    });
    root?.addEventListener("click", (event) => this.handleAction(event));
    this.ownerDocument.addEventListener("keydown", this.handleKeyDown);
  }

  private handleAction(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-workbench-action]");
    if (!target || target.matches(":disabled")) return;
    const action = target.dataset.workbenchAction;
    const operations: Record<string, () => Promise<unknown>> = {
      select: async () => {
        this.shadowRoot?.querySelector<HTMLInputElement>("[data-flatpak]")?.click();
      },
      import: async () => {
        this.shadowRoot?.querySelector<HTMLInputElement>("[data-evidence]")?.click();
      },
      deploy: () => this.lab!.rehearseDeploy(),
      launch: () => this.lab!.start(),
      stop: () => this.lab!.stop(),
      restart: () => this.lab!.restartCapsule(),
      crash: () => this.lab!.simulateCrash(),
      recover: () => this.lab!.recoverCrash(),
      update: () => this.lab!.simulateUpdate(this.management.currentRelease + 1),
      "failed-update": () => this.lab!.simulateFailedUpdate(this.management.currentRelease + 1),
      rollback: () => this.lab!.simulateRollback(),
      remove: () => this.removeApplication(),
      normal: () => this.runScenario("normal-session"),
      tracking: () => this.runScenario("tracking-recovery"),
      controller: () => this.pulseController(),
      loss: () => this.lab!.injectEvent("tracking-lost"),
      restore: () => this.lab!.injectEvent("tracking-restored"),
      export: () => this.downloadReport(),
    };
    if (!action || !operations[action]) return;
    operations[action]().catch((error) => this.showError(error));
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
      event.preventDefault();
      this.shadowRoot?.querySelector<HTMLInputElement>("[data-flatpak]")?.click();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (["READY", "RUNNING", "STOPPED"].includes(this.applicationState)) this.runScenario("normal-session").catch((error) => this.showError(error));
    }
    if (event.key === "Escape" && this.management.applicationSessionState === "RUNNING") {
      this.lab?.stop().catch((error) => this.showError(error));
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      this.moveFocus(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
      event.preventDefault();
    }
    const sectionIndex = Number(event.key) - 1;
    if (sectionIndex >= 0 && sectionIndex < sections.length && !event.metaKey && !event.ctrlKey) {
      this.selectSection(sections[sectionIndex]);
    }
  };

  private pollGamepad = (): void => {
    const gamepad = Array.from(navigator.getGamepads()).find((candidate) => candidate?.connected);
    if (gamepad) {
      const pressed = new Set(gamepad.buttons.flatMap((button, index) => button.pressed ? [index] : []));
      if ([12, 14].some((index) => pressed.has(index) && !this.gamepadButtons.has(index))) this.moveFocus(-1);
      if ([13, 15].some((index) => pressed.has(index) && !this.gamepadButtons.has(index))) this.moveFocus(1);
      if (pressed.has(0) && !this.gamepadButtons.has(0)) {
        (this.shadowRoot?.activeElement as HTMLButtonElement | null)?.click();
      }
      this.gamepadButtons = pressed;
    } else {
      this.gamepadButtons.clear();
    }
    this.gamepadFrame = requestAnimationFrame(this.pollGamepad);
  };

  private moveFocus(direction: -1 | 1): void {
    const controls = Array.from(this.shadowRoot?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (controls.length === 0) return;
    const current = controls.indexOf(this.shadowRoot?.activeElement as HTMLButtonElement);
    controls[(current + direction + controls.length) % controls.length]?.focus();
  }

  private selectSection(section: WorkbenchSection): void {
    this.activeSection = section;
    this.workspace.save(section);
    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-section]").forEach((button) => {
      if (button.dataset.section === section) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const inspector = this.shadowRoot?.querySelector<HTMLElement>(".frameulator-inspector");
    if (inspector && matchMedia("(max-width: 820px)").matches) inspector.dataset.open = "true";
    this.selectInspectorTab("inspect");
    this.renderSection();
  }

  private selectInspectorTab(tab: string): void {
    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    });
    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
  }

  private renderSection(): void {
    const title = this.shadowRoot?.querySelector<HTMLElement>("[data-inspector-title]");
    const state = this.shadowRoot?.querySelector<HTMLElement>("[data-inspector-state]");
    const content = this.shadowRoot?.querySelector<HTMLElement>("[data-section-content]");
    if (!title || !state || !content) return;
    title.textContent = this.activeSection[0].toUpperCase() + this.activeSection.slice(1);
    const release = this.verification?.release;
    const rows = (items: Array<[string, string]>) => `<dl>${items.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
    const button = (label: string, action: string, kind = "") => `<button type="button" class="${kind}" data-workbench-action="${action}">${label}</button>`;

    if (this.activeSection === "package") {
      state.textContent = this.applicationState;
      content.innerHTML = `${rows([
        ["File", this.verification?.fileName ?? "No Flatpak selected"],
        ["Size", this.verification ? `${(this.verification.size / 1048576).toFixed(2)} MB` : "—"],
        ["Version", release?.version ?? "—"],
        ["Architecture", release?.architecture ?? "—"],
        ["Source", release?.sourceCommit ?? "—"],
        ["Signature", release ? (this.getAttribute("trusted-key-id") ?? "Verified Ed25519 registry") : "—"],
        ["Capsule", release?.browserWasmSha256 ?? "—"],
        ["Project", this.management.projectState],
        ["Capsule ABI", release ? String(release.capsuleAbi) : "—"],
      ])}<p class="hash-line">${escapeHtml(this.verification?.flatpakSha256 ?? "Select an approved Agora release to unlock the workbench.")}</p><div class="action-grid">${button("Open Flatpak", "select", "primary")} ${button("Remove", "remove")}</div>`;
    } else if (this.activeSection === "device") {
      state.textContent = this.management.deviceState;
      content.innerHTML = `${rows([
        ["Target", "Steam Frame"], ["Architecture", "ARM64 contract"], ["Memory", `${SteamFrameProfile.hardware.memoryMiB} MiB contract`], ["GPU", "Adreno contract"],
        ["OpenXR", "1.1 simulated"], ["Tracking", this.management.applicationSessionState === "CRASHED" ? "Unavailable" : "Available"],
      ])}<p class="boundary-note">Hardware, firmware, GPU drivers, and SteamVR are simulated in this browser.</p>`;
    } else if (this.activeSection === "deploy") {
      state.textContent = this.management.deploymentState;
      content.innerHTML = `${rows([
        ["Current", this.management.currentRelease ? `Generation ${this.management.currentRelease}` : "None"],
        ["Previous", this.management.previousRelease ? `Generation ${this.management.previousRelease}` : "None"],
        ["Policy", this.management.deviceState === "AVAILABLE" ? "Ready" : "Blocked"],
        ["Mode", "Deployment rehearsal"],
      ])}<ol class="event-timeline">${this.management.events.slice(-6).map((event) => `<li><span>${event.sequence}</span>${escapeHtml(event.kind)}</li>`).join("") || "<li>No deployment events</li>"}</ol><div class="action-stack">${button("Rehearse deploy", "deploy", "primary")} ${button("Simulate update", "update")} ${button("Fail update + recover", "failed-update")} ${button("Rollback", "rollback")}</div>`;
    } else if (this.activeSection === "session") {
      state.textContent = this.management.applicationSessionState;
      content.innerHTML = `${rows([
        ["Application", this.management.applicationSessionState], ["OpenXR", this.readHud("[data-hud-session]")],
        ["Frames", this.readHud("[data-hud-frames]")], ["Last event", this.management.lastEvent],
      ])}<div class="action-stack">${button("Launch capsule", "launch", "primary")} ${button("Stop", "stop")} ${button("Restart capsule", "restart")} ${button("Simulate crash", "crash", "danger")} ${button("Recover", "recover")} ${button("Lose tracking", "loss")} ${button("Restore tracking", "restore")}</div>`;
    } else if (this.activeSection === "tests") {
      state.textContent = this.management.testState;
      content.innerHTML = `<div class="scenario-list"><button type="button" data-workbench-action="normal"><span>01</span><strong>Managed normal session</strong><small>Verify, deploy, launch, focus, render</small></button><button type="button" data-workbench-action="tracking"><span>02</span><strong>Tracking recovery</strong><small>Lose tracking and return to focused</small></button><button type="button" data-workbench-action="controller"><span>03</span><strong>Controller action</strong><small>Drive the visible right controller from the input bridge</small></button><article><span>04–12</span><strong>Policy and evidence suite</strong><small>Invalid package, crash, update, rollback, persistence, cleanup, and native comparison run through API and CI checks.</small></article></div>`;
    } else {
      state.textContent = this.lastReport?.passed ? "PASSED" : "NOT RUN";
      content.innerHTML = `${rows([
        ["Browser", this.lastReport ? (this.lastReport.passed ? "Passed" : "Failed") : "Not run"],
        ["Level", "F1/F2"], ["Native install", "Not executed here"], ["Physical device", "Not tested"],
      ])}<div class="action-stack">${button("Import native evidence", "import")} ${button("Export frameproof", "export", "primary")}</div>`;
    }
    this.syncControls();
  }

  private renderServices(): void {
    const container = this.shadowRoot?.querySelector(".frameulator-services");
    if (!this.services || !container) return;
    container.innerHTML = serviceOrder.map((name) => `<article><div><strong>${name}</strong><span>${this.services![name].status}</span></div><p>${this.services![name].detail}</p></article>`).join("");
  }

  private selectFlatpak(file: File): void {
    this.appendLog(`Selected ${file.name} · ${Math.ceil(file.size / 1024)} KB`);
    this.lab?.selectFlatpak(file).then((verification) => {
      this.verification = verification;
      this.appendLog(`Verified ${verification.release?.version} · capsule ABI ${verification.release?.capsuleAbi}`);
      this.renderSection();
    }).catch((error) => this.showError(error));
  }

  private setApplicationState(state: ApplicationState, detail: string, progress?: number): void {
    this.applicationState = state;
    const upload = this.shadowRoot?.querySelector<HTMLElement>(".frameulator-upload");
    const detailElement = this.shadowRoot?.querySelector<HTMLElement>("[data-upload-detail]");
    const progressElement = this.shadowRoot?.querySelector<HTMLProgressElement>("progress");
    if (upload) {
      upload.dataset.uploadState = state;
      upload.hidden = ["READY", "RUNNING", "STOPPED"].includes(state);
    }
    if (detailElement) detailElement.textContent = detail;
    if (progressElement) {
      progressElement.hidden = state !== "HASHING";
      progressElement.value = progress ?? 0;
    }
    this.setText("[data-status]", detail);
    this.appendLog(`${state} · ${detail}`);
    this.renderSection();
  }

  private setManagement(snapshot: ManagementSnapshot): void {
    this.management = structuredClone(snapshot);
    this.setText("[data-top-device]", snapshot.deviceState);
    this.setText("[data-top-package]", this.verification?.release ? `Agora ${this.verification.release.version}` : "Verified Agora");
    this.setText("[data-last-event]", snapshot.lastEvent);
    this.appendLog(`${snapshot.lastEvent} · ${snapshot.deploymentState} · ${snapshot.applicationSessionState}`);
    this.renderSection();
  }

  private updateFrameHud(snapshot?: { sessionState?: string; frameCount?: number }): void {
    if (!snapshot) return;
    this.setText("[data-hud-session]", `SESSION · ${snapshot.sessionState ?? "IDLE"}`);
    this.setText("[data-hud-frames]", `${snapshot.frameCount ?? 0} FRAMES`);
    if (this.activeSection === "session") this.renderSection();
  }

  private syncControls(): void {
    const verified = ["READY", "RUNNING", "STOPPED"].includes(this.applicationState);
    const deployed = this.management.deploymentState === "DEPLOYED";
    const running = this.management.applicationSessionState === "RUNNING";
    this.setDisabled("run", !verified);
    this.setDisabled("stop", !running);
    this.setWorkbenchDisabled("deploy", !verified || this.management.deploymentState !== "ABSENT");
    this.setWorkbenchDisabled("launch", !deployed || this.management.applicationSessionState !== "IDLE");
    this.setWorkbenchDisabled("stop", !running);
    this.setWorkbenchDisabled("restart", !verified || !deployed || !["IDLE", "RUNNING", "CRASHED"].includes(this.management.applicationSessionState));
    this.setWorkbenchDisabled("crash", !running);
    this.setWorkbenchDisabled("recover", this.management.applicationSessionState !== "CRASHED");
    this.setWorkbenchDisabled("update", !verified || !deployed || this.management.applicationSessionState !== "IDLE");
    this.setWorkbenchDisabled("failed-update", !verified || !deployed || this.management.applicationSessionState !== "IDLE");
    this.setWorkbenchDisabled("rollback", !verified || !deployed || this.management.previousRelease === 0);
    this.setWorkbenchDisabled("remove", !verified);
    this.setWorkbenchDisabled("normal", !verified);
    this.setWorkbenchDisabled("tracking", !verified);
    this.setWorkbenchDisabled("controller", !verified);
    this.setWorkbenchDisabled("loss", !running);
    this.setWorkbenchDisabled("restore", !running);
    this.setWorkbenchDisabled("export", !this.lastReport);
    this.setText("[data-section-state=package]", verified ? "ready" : "waiting");
    this.setText("[data-section-state=device]", this.management.deviceState.toLowerCase());
    this.setText("[data-section-state=deploy]", this.management.deploymentState.toLowerCase());
    this.setText("[data-section-state=session]", this.management.applicationSessionState.toLowerCase());
    this.setText("[data-section-state=tests]", this.management.testState.toLowerCase());
    this.setText("[data-section-state=evidence]", this.lastReport?.passed ? "passed" : "waiting");
    const light = this.shadowRoot?.querySelector<HTMLElement>("[data-status-light]");
    if (light) light.dataset.state = running ? "running" : verified ? "ready" : "waiting";
  }

  private async runScenario(scenario: string): Promise<void> {
    if (!this.lab) return;
    this.appendLog(`Running ${scenario}`);
    await this.lab.runScenario(scenario);
  }

  private async pulseController(): Promise<void> {
    if (!this.lab) return;
    await this.lab.setControllerState("right", { trigger: 1, buttons: { primary: true } });
    this.appendLog("Controller · right primary pressed");
    await new Promise((resolve) => setTimeout(resolve, 180));
    await this.lab.setControllerState("right", { trigger: 0, buttons: { primary: false } });
  }

  private async importEvidence(file: File): Promise<void> {
    const evidence = await this.lab?.importEvidence(file);
    if (!evidence) return;
    const proof = this.shadowRoot?.querySelector<HTMLElement>("[data-proof-native]");
    if (proof) proof.innerHTML = `<span>Native evidence</span><strong>${evidence.passed ? "Passed" : "Failed"}</strong><small>${escapeHtml(evidence.evidenceLevel)} · ${escapeHtml(evidence.producer)}</small>`;
    this.appendLog(`Imported ${evidence.evidenceLevel} evidence · ${evidence.scenario}`);
    this.selectInspectorTab("proof");
  }

  private showReport(report: ScenarioReport): void {
    this.lastReport = report;
    this.management = structuredClone(report.management.snapshot);
    this.setText("[data-status]", report.passed ? `${report.scenario} passed · ${report.frameCount} frames` : `${report.scenario} failed`);
    const proof = this.shadowRoot?.querySelector<HTMLElement>("[data-proof-browser]");
    if (proof) proof.innerHTML = `<span>Browser contract</span><strong>${report.passed ? "Passed" : "Failed"}</strong><small>F1/F2 · ${report.frameCount} frames · native execution false</small>`;
    this.appendLog(`${report.passed ? "PASS" : "FAIL"} · ${report.scenario} · ${report.frameCount} frames`);
    this.renderSection();
  }

  private async removeApplication(): Promise<void> {
    await this.lab?.removeApplication();
    this.verification = undefined;
    this.lastReport = undefined;
    this.management = structuredClone(emptyManagement);
    this.workspace.clear();
    this.setText("[data-top-package]", "None");
    this.setText("[data-top-device]", "Offline");
    this.appendLog("Application removed from the local workbench");
    this.renderSection();
  }

  private restoreReportSummary(report: ScenarioReport): void {
    this.lastReport = report;
    const proof = this.shadowRoot?.querySelector<HTMLElement>("[data-proof-browser]");
    if (proof) proof.innerHTML = `<span>Previous browser contract</span><strong>${report.passed ? "Passed" : "Failed"}</strong><small>Reselect the exact Flatpak before capsule access is restored.</small>`;
    this.setText("[data-status]", "Previous report restored · Flatpak must be selected again");
    this.appendLog(`Restored report metadata · ${report.scenario}`);
  }

  private restoreNativeSummary(evidence: { evidenceLevel: string; producer: string; passed: boolean }): void {
    const proof = this.shadowRoot?.querySelector<HTMLElement>("[data-proof-native]");
    if (proof) proof.innerHTML = `<span>Stored native evidence</span><strong>${evidence.passed ? "Passed" : "Failed"}</strong><small>${escapeHtml(evidence.evidenceLevel)} · ${escapeHtml(evidence.producer)}</small>`;
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.setText("[data-status]", `Blocked · ${message}`);
    this.appendLog(`ERROR · ${message}`);
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

  private appendLog(message: string): void {
    this.logEntries.push(`${new Date().toLocaleTimeString([], { hour12: false })}  ${message}`);
    if (this.logEntries.length > 80) this.logEntries.shift();
    const logs = this.shadowRoot?.querySelector<HTMLElement>(".frameulator-logs");
    if (logs) {
      logs.textContent = this.logEntries.join("\n");
      logs.scrollTop = logs.scrollHeight;
    }
  }

  private setDisabled(action: string, disabled: boolean): void {
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>(`[data-action="${action}"]`).forEach((button) => { button.disabled = disabled; });
  }

  private setWorkbenchDisabled(action: string, disabled: boolean): void {
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>(`[data-workbench-action="${action}"]`).forEach((button) => { button.disabled = disabled; });
  }

  private setText(selector: string, value: string): void {
    const element = this.shadowRoot?.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  private readHud(selector: string): string {
    return this.shadowRoot?.querySelector<HTMLElement>(selector)?.textContent ?? "—";
  }

  private dispatch(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

export function defineFrameulatorElement(tagName = "frameulator-lab"): void {
  if (!("customElements" in globalThis)) return;
  if (!customElements.get(tagName)) customElements.define(tagName, FrameulatorElement);
}
