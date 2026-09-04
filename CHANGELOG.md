# Changelog

## Unreleased

- Require an approved local Agora Flatpak before application sessions can run.
- Add streaming SHA-256, signed release-registry verification, and exact capsule verification.
- Add the Agora browser-capsule Worker path and capsule-driven Three.js validation scene.
- Record the Flatpak verification and native-execution boundary in every application report.
- Remove the browser-VM direction and retain a lightweight static-site architecture.
- Add a disabled-by-default static release configuration so maintainers can activate a signed Agora release without changing application code.

## 0.1.0 - 2026-09-04

- Added the deterministic Rust/WebAssembly simulation kernel.
- Added the JavaScript and TypeScript API, inline Worker mode, external Worker mode, and main-thread fallback.
- Added the `<frameulator-lab>` Web Component and Three.js validation scene.
- Added models for the nine Steam Frame-facing service boundaries.
- Added the static GitHub Pages demonstration site.
- Added source, package, scenario, and browser release checks.
