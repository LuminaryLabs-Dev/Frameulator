# @luminarylabs/frameulator

Lightweight Agora Flatpak verification and a fixed, single-screen MDM Lite workbench for Steam Frame-facing contracts. Agora's shared ABI 2 management core drives deploy, session, update, rollback, crash-recovery, project, and test state. Browser reports remain F1/F2 simulation evidence; the package never claims that the native Flatpak was installed or executed.

```bash
npm install @luminarylabs/frameulator@0.2.0
```

```js
import { Frameulator, SteamFrameProfile } from "@luminarylabs/frameulator";

const lab = await Frameulator.create({
  container: document.querySelector("#lab"),
  profile: SteamFrameProfile,
  renderer: "auto",
  storage: "indexeddb",
  network: "disabled",
  releaseRegistry: "/releases/agora-0.0.2-release.json",
  trustedReleaseKeys: [{
    id: "luminary-release-2026",
    algorithm: "Ed25519",
    publicKeyBase64: trustedPublicKey,
  }],
});

await lab.selectFlatpak(fileInput.files[0]);
await lab.rehearseDeploy();
await lab.launchCapsule();
await lab.stopCapsule();
const report = await lab.runScenario("normal-session");
await lab.destroy();
```

For a custom element, import `@luminarylabs/frameulator/standalone`, call `defineFrameulatorElement()`, and configure `<frameulator-lab release-registry="…" trusted-key-id="…" trusted-public-key="…">`. Without a trusted signed registry, the element stays upload-gated and rejects all bundles.

See the [repository documentation](https://github.com/LuminaryLabs-Dev/Frameulator) for Worker modes, jsDelivr use, build instructions, and evidence boundaries.
