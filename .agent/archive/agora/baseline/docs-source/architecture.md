# Architecture

Frameulator has no remote application backend or browser Linux VM. The static page hashes a selected Flatpak locally and verifies its identity through a signed release registry. Only then does the Worker instantiate the matching Agora browser capsule beside the Frameulator contract kernel. IndexedDB stores reports, while Three.js renders the capsule-driven validation scene on the main thread.

```text
Local Flatpak → streaming SHA-256 → signed registry match
                                      ↓
Static page → full-screen Web Component → Worker RPC v2 → Frameulator host kernel
                                                ↘ Agora ABI 2 management capsule
                                                ↘ Three.js stereo renderer
                                                ↘ bounded IndexedDB reports
```

The modular package emits a separate Worker and host WASM file for strict CSP and caching. The standalone package embeds the Worker source and host WASM bytes in one ESM file for jsDelivr use. A verified Agora capsule remains a separate immutable release file. Neither mode requires `SharedArrayBuffer`.

The Flatpak itself is not parsed, installed, or executed in the browser. Its exact SHA-256 acts as the release identity. Native release CI must verify and sign that hash before publishing the registry.

## Operator workbench

The document itself never scrolls. A command bar, workflow rail, Three.js stage, contextual inspector, and status bar fill the viewport. Package upload remains the gate. After verification, the shared Agora management core authorizes deployment rehearsal, session launch, update, rollback, removal, crash recovery, project validation, and tests. Frameulator supplies the simulated device; it does not maintain an independent success state.

## Validation boundary

| Level | Meaning | Produced in the browser |
| --- | --- | --- |
| F1 | Deterministic host and matching Agora-capsule simulation | Yes |
| F2 | Three.js stereo visualization and browser input | Yes |
| F3 | Native Lavapipe Vulkan run | No; import later as external evidence |
| F4 | Monado or SteamVR OpenXR run | No |
| F5 | ARM64 VM and Flatpak run | No |
| F6 | Physical Steam Frame run | No |

Frameulator never promotes an F1/F2 result to F3 or higher.
