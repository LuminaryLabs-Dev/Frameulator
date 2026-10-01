# Frameulator

Generic application-adapter and XR contract simulation workbench. Applications provide lifecycle, structured input, state and bounded RGBA surfaces. The host supplies an independently testable WASM kernel, simulated headset/controllers, Three.js inspection, isolated instances and explicit evidence boundaries.

## Run

Node >=22, npm 11.9 and the Rust toolchain in `rust-toolchain.toml` are required.

```
npm ci --ignore-scripts
npm run verify
npm run preview
```

The browser workbench ships a small neutral panel adapter. Load the sample, start it, click its surface, stop/reset/remove it, and export an evidence report. No uploaded executable or product-specific deployment is required.

## Trusted adapter injection

```
import {Frameulator} from '@luminarylabs/frameulator';
const lab = await Frameulator.create({worker:false, adapters:[reviewedAdapter]});
await lab.loadApplication({adapterId:reviewedAdapter.id, manifest, config});
await lab.start();
await lab.input({type:'pointer',surfaceId:'surface.main',phase:'down',x:0.5,y:0.5,button:0});
await lab.input({type:'pointer',surfaceId:'surface.main',phase:'up',x:0.5,y:0.5,button:0});
await lab.destroy();
```

Factories implement `ApplicationAdapterFactory` (see exported TypeScript declarations). Source adapters declare a pinned repository/commit. Code injection is only for reviewed host code; it is not an untrusted JavaScript sandbox. The generic host never imports an arbitrary application URL. Worker mode includes the bundled sample; injecting functions requires explicit `worker:false` or a separately reviewed custom Worker build.

Adapter snapshots contain JSON data and up to four rgba8 surfaces, each at most 1024×1024. Surface rows and pointer coordinates use top-left origin. Lifecycle requests are serialized, input is validated, snapshots are copied, and removal disposes resources. Product logic remains owned by the injected application.

## Trust and evidence

The independent signed-package API retains Ed25519 trusted keys and exact SHA-256 package/artifact matching. It verifies bytes only; it does not execute a native package or automatically authorize a JavaScript adapter. JS adapter evidence states `trust: host-injected`, `signatureVerified:false` and `executionMode:trusted-js-adapter`.

Schema 3 reports separate host-kernel results from application execution. `applicationAssertionsChecked:false` means host scenario success does not prove application behavior. Interactive reports do not claim a passing test. Native execution and hardware proof remain false. Imported native evidence remains separate and is not cryptographically authenticated by importing it.

## Integration and validation

The generic adapter contract was additionally exercised against three separately maintained applications. Those private integrations and detailed dependency provenance are retained separately; this public repository includes only the generic runtime and neutral sample. Public verification does not require access to private repositories.

Historical integration, schemas, source, fixtures and generated assets are preserved byte-for-byte in `.agent/archive/agora/`. `npm run verify:archive` verifies its original path set and checksums. See that directory's README for isolated historical regression reproduction. Active builds never import the archive.

`npm run verify` builds modular/standalone/Worker/types/site, runs active tests, verifies monorepo contracts, archive integrity and distribution boundaries. No publishing or deployment is implied by local verification.
