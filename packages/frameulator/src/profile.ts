import type { FrameulatorProfile } from "./types";

export const SteamFrameProfile: FrameulatorProfile = Object.freeze({
  id: "steam-frame",
  label: "Steam Frame browser contract",
  version: "0.2.0",
  simulated: true,
  evidenceLevel: "F1-browser-wasm",
  display: {
    eyeWidth: 1440,
    eyeHeight: 1440,
    refreshRatesHz: [72, 90, 120],
    defaultRefreshRateHz: 72,
  },
  hardware: {
    architecture: "aarch64" as const,
    memoryMiB: 16_384,
  },
  gpu: {
    vendor: "Qualcomm",
    family: "Adreno",
    driver: "simulated-contract",
    api: "Vulkan 1.3 contract",
  },
  openxr: {
    apiVersion: "1.1",
    runtime: "SteamVR contract model",
    viewConfiguration: "PRIMARY_STEREO" as const,
  },
});

export function resolveProfile(profile: FrameulatorProfile | "steam-frame" | undefined): FrameulatorProfile {
  if (profile === undefined || profile === "steam-frame") return SteamFrameProfile;
  if (!profile.simulated || profile.evidenceLevel !== "F1-browser-wasm") {
    throw new Error("Browser profiles must be explicitly labeled simulated at F1-browser-wasm.");
  }
  return profile;
}
