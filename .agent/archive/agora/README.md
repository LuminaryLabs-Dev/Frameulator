# Archived application integration

This is an exact tracked-source snapshot of Frameulator commit d47d9a15e88b06f1fa6fac0b59f22f06e6138151, preserving the original Agora ABI 2 / Flatpak workbench, test fixture, historical documentation, generated bundles and all dependency/build context.

`manifest.json` records original paths, Git blob identities, SHA-256, sizes and modes. Run `npm run verify:archive` from the active repository to verify the entire path set and all bytes. Do not edit baseline files. The active application never imports this directory; package files and static builds exclude it.

To reproduce historical regressions, copy `baseline/` into a separate temporary directory, install the exact lockfile with `npm ci --ignore-scripts`, install the declared Rust toolchain, then run `npm run verify`. Do not run the build inside the archive because it rewrites generated outputs. Preserve the original MIT notice. The original tests demonstrate browser simulation and fixture behavior, not native execution or a production signed release.
