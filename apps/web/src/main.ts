import { defineFrameulatorElement } from "@luminarylabs/frameulator";
import "./site.css";

interface SiteReleaseConfig {
  schemaVersion: 1;
  enabled: boolean;
  releaseRegistry: string | null;
  trustedReleaseKey: { id: string; algorithm: "Ed25519"; publicKeyBase64: string } | null;
}

const lab = document.querySelector("frameulator-lab");
const status = document.querySelector<HTMLElement>("#page-status");
let releaseConfigured = false;

try {
  const response = await fetch(new URL("releases/config.json", document.baseURI));
  if (!response.ok) throw new Error(`release configuration returned ${response.status}`);
  const config = await response.json() as SiteReleaseConfig;
  if (config.schemaVersion !== 1) throw new Error("unsupported release configuration");
  if (config.enabled) {
    if (!config.releaseRegistry || !config.trustedReleaseKey || config.trustedReleaseKey.algorithm !== "Ed25519") {
      throw new Error("enabled release configuration is incomplete");
    }
    lab?.setAttribute("release-registry", config.releaseRegistry);
    lab?.setAttribute("trusted-key-id", config.trustedReleaseKey.id);
    lab?.setAttribute("trusted-public-key", config.trustedReleaseKey.publicKeyBase64);
    releaseConfigured = true;
  }
} catch (error) {
  if (status) status.textContent = `Release configuration blocked · ${error instanceof Error ? error.message : String(error)}`;
}

defineFrameulatorElement();

lab?.addEventListener("frameulator-ready", () => {
  if (status) {
    status.textContent = releaseConfigured
      ? "Flatpak required · nothing uploaded"
      : "Flatpak required · release registry not configured";
  }
});
lab?.addEventListener("frameulator-application", ((event: CustomEvent) => {
  if (status) status.textContent = `${event.detail.state} · ${event.detail.detail}`;
}) as EventListener);
lab?.addEventListener("frameulator-result", ((event: CustomEvent) => {
  if (status) status.textContent = event.detail.passed ? "Scenario passed · verified capsule · F1/F2" : "Scenario failed";
}) as EventListener);
lab?.addEventListener("frameulator-error", ((event: CustomEvent) => {
  if (status) status.textContent = `Blocked · ${event.detail.message}`;
}) as EventListener);

document.querySelector("[data-copy]")?.addEventListener("click", async (event) => {
  const value = "https://cdn.jsdelivr.net/npm/@luminarylabs/frameulator@0.1.0/dist/frameulator.standalone.js";
  await navigator.clipboard.writeText(value);
  const button = event.currentTarget as HTMLButtonElement;
  button.textContent = "Copied exact 0.1.0 URL";
  setTimeout(() => { button.textContent = "Copy CDN import"; }, 1800);
});
