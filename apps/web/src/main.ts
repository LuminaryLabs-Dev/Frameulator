import { defineFrameulatorElement } from "@luminarylabs/frameulator";
import "./site.css";

defineFrameulatorElement();

const lab = document.querySelector("frameulator-lab");
const status = document.querySelector<HTMLElement>("#page-status");

lab?.addEventListener("frameulator-ready", () => {
  if (status) status.textContent = "Rust/WASM ready · simulated";
});
lab?.addEventListener("frameulator-result", ((event: CustomEvent) => {
  if (status) status.textContent = event.detail.passed ? "Scenario passed · F1" : "Scenario failed";
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

