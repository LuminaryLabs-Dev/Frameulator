# Frameulator

Frameulator is a deterministic browser laboratory for applications that target Steam Frame-facing platform contracts. It packages a dependency-free Rust state kernel as WebAssembly, exposes a TypeScript API, runs the kernel in a Web Worker, and renders an inspectable headset environment with Three.js.

> **Evidence boundary:** Frameulator produces **F1 browser/WASM simulation evidence**. It does not run SteamVR, native OpenXR, Vulkan drivers, Qualcomm firmware, Gamescope, or physical tracking hardware. Browser reports are always marked `simulated: true`.

## What 0.1.0 implements

- ARM64 hardware capability and timing contract model.
- Qualcomm/Adreno capability and resource-budget model.
- Vulkan-like device, resource, and submission contract model.
- OpenXR 1.1 session lifecycle state machine in Rust/WASM.
- Gamescope-like frame queue, focus, and pacing model.
- Deterministic headset firmware lifecycle model.
- Synthetic head tracking, prediction, loss, and recovery.
- Virtual left and right Frame controller state.
- Browser Worker message bus for host-service and socket contracts.
- Three.js environment, stereo framebuffer previews, scenarios, reports, and IndexedDB persistence.

## Repository outputs

| Output | Location | Purpose |
| --- | --- | --- |
| npm package | `packages/frameulator` | `@luminarylabs/frameulator` source and package files |
| Modular ESM | `packages/frameulator/dist/frameulator.js` | Bundler/browser module with external Three.js dependency |
| Standalone ESM | `packages/frameulator/dist/frameulator.standalone.js` | One-file CDN build containing Three.js, Worker code, and WASM |
| Static website | `docs/` | GitHub Pages-ready demonstration site |
| Rust kernel | `packages/frameulator/rust` | Dependency-free deterministic state core |

## Install

After `0.1.0` is published to npm:

```bash
npm install @luminarylabs/frameulator@0.1.0
```

```js
import { Frameulator } from "@luminarylabs/frameulator";

const lab = await Frameulator.create({
  container: document.querySelector("#frameulator"),
  profile: "steam-frame",
  network: "disabled",
});

const report = await lab.run("normal-session");
console.log(report.simulated, report.evidenceLevel);
```

## Exact jsDelivr import

Once the public npm version exists, a static page can use the immutable version URL:

```html
<script type="module">
  import { defineFrameulatorElement } from
    "https://cdn.jsdelivr.net/npm/@luminarylabs/frameulator@0.1.0/dist/frameulator.standalone.js";

  defineFrameulatorElement();
</script>

<frameulator-lab profile="steam-frame" scenario="normal-session"></frameulator-lab>
```

Never use `@latest`, an untagged GitHub branch, or a branch name in production embeds.

## Worker modes

```js
await Frameulator.create({ worker: "inline" }); // default; Blob Worker
await Frameulator.create({ worker: false }); // main-thread fallback
await Frameulator.create({ workerUrl: "/frameulator.worker.js" }); // strict CSP
```

The build does not require `SharedArrayBuffer` or cross-origin isolation headers. Strict Content Security Policies that reject `blob:` Workers should self-host the modular Worker and WASM files.

## Native evidence comparison

Frameulator can import a `.frameproof.json` produced by a separate native runner and compare its scenario identity with a browser report. Imported evidence must say `simulated: false` and use an F3–F6 evidence label. Frameulator never executes the native payload and never treats F1 simulation as proof of native behavior.

```js
const native = await lab.importEvidence(file);
const comparison = lab.compareEvidence({ simulation: report, native });
```

Zip containers and native Lavapipe binaries are deferred; browser 0.1.0 accepts JSON evidence only.

## Build and verify

Requirements: Node.js 22+, npm, Rust 1.89+, and the `wasm32-unknown-unknown` target.

```bash
rustup target add wasm32-unknown-unknown
npm ci
npm run verify
```

`npm run verify` builds the Rust/WASM kernel, modular and standalone packages, the static site, declarations, tests, and `npm pack --dry-run` checks. Preview the Pages artifact locally with:

```bash
node scripts/serve-docs.mjs
```

Then open `http://127.0.0.1:4173/Frameulator/`.

## Publishing

The repository does not publish automatically. A maintainer who controls the `@luminarylabs` npm scope must verify the release, tag the exact commit as `v0.1.0`, and run:

```bash
npm publish --access public --workspace @luminarylabs/frameulator
```

Configure GitHub Pages to deploy the `docs/` directory from `main`. GitHub and npm publishing are release-time operations; the installed module never contacts GitHub at runtime.

## License

MIT. Third-party packages retain their own licenses and are listed by the npm lockfile.
