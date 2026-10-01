import { defineFrameulatorElement } from "@luminarylabs/frameulator";
import "./site.css";

interface SiteReleaseConfig {
  schemaVersion: 1;
  enabled: boolean;
  releaseRegistry: string | null;
  trustedReleaseKey: { id: string; algorithm: "Ed25519"; publicKeyBase64: string } | null;
}

const lab = document.querySelector("frameulator-lab");

try {
  const response = await fetch(new URL("releases/config.json", document.baseURI));
  if (!response.ok) throw new Error(`release configuration returned ${response.status}`);
  const config = await response.json() as SiteReleaseConfig;
  if (config.schemaVersion !== 1) throw new Error("unsupported release configuration");
  lab?.setAttribute("release-configured", String(config.enabled));
  if (config.enabled) {
    if (!config.releaseRegistry || !config.trustedReleaseKey || config.trustedReleaseKey.algorithm !== "Ed25519") {
      throw new Error("enabled release configuration is incomplete");
    }
    lab?.setAttribute("release-registry", config.releaseRegistry);
    lab?.setAttribute("trusted-key-id", config.trustedReleaseKey.id);
    lab?.setAttribute("trusted-public-key", config.trustedReleaseKey.publicKeyBase64);
  }
} catch (error) {
  lab?.setAttribute("release-configured", "false");
  console.error("Frameulator release configuration blocked", error);
}

defineFrameulatorElement();
