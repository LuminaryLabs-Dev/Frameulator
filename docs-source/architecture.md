# Architecture

Frameulator 0.1.0 has no remote application backend. The static page creates a browser Worker, the Worker instantiates the Rust/WebAssembly kernel, and structured messages cross the Worker boundary. IndexedDB stores the latest browser report. Three.js renders the visualization on the main thread.

```text
Static page → Web Component → Worker RPC → Rust/WASM state core
                         ↘ Three.js renderer
                         ↘ IndexedDB reports
```

The modular package emits a separate Worker and WASM file for strict CSP and caching. The standalone package embeds the Worker source and WASM bytes in one ESM file for jsDelivr use. Neither mode requires `SharedArrayBuffer`.

## Validation boundary

| Level | Meaning | Produced in the browser |
| --- | --- | --- |
| F1 | Deterministic source/WASM contract simulation | Yes |
| F2 | Three.js visualization and browser input | Yes |
| F3 | Native Lavapipe Vulkan run | No; import later as external evidence |
| F4 | Monado or SteamVR OpenXR run | No |
| F5 | ARM64 VM and Flatpak run | No |
| F6 | Physical Steam Frame run | No |

Frameulator never promotes an F1/F2 result to F3 or higher.

