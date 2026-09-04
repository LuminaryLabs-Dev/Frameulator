# @luminarylabs/frameulator

Deterministic Rust/WASM browser simulation for Steam Frame-facing contracts. All results are labeled simulated F1 evidence; this package does not execute native Vulkan, SteamVR, firmware, drivers, or hardware.

```bash
npm install @luminarylabs/frameulator@0.1.0
```

```js
import { Frameulator, SteamFrameProfile } from "@luminarylabs/frameulator";

const lab = await Frameulator.create({
  container: document.querySelector("#lab"),
  profile: SteamFrameProfile,
  renderer: "auto",
  storage: "indexeddb",
  network: "disabled",
});

const report = await lab.runScenario("normal-session");
await lab.destroy();
```

For a custom element, import `@luminarylabs/frameulator/standalone`, call `defineFrameulatorElement()`, and add `<frameulator-lab>` to the page.

See the [repository documentation](https://github.com/LuminaryLabs-Dev/Frameulator) for Worker modes, jsDelivr use, build instructions, and evidence boundaries.

