# @luminarylabs/frameulator

Generic application-adapter and simulated XR contract workbench. A trusted adapter supplies lifecycle, structured input, state and bounded rgba8 surfaces; Frameulator supplies kernel simulation, rendering, controls and evidence reports.

Use the exported `Frameulator`, `ApplicationAdapterFactory`, `NeutralPanelAdapter`, `ApplicationGate` and `verifyReleaseRegistry` APIs. See the repository README and TypeScript declarations for full contracts.

Explicit adapter injection requires `worker:false`; default Worker mode contains the neutral sample only. No arbitrary JavaScript uploads or remote modules are executed. Signed package verification does not authorize injected JS.

Browser and local Node results are simulation evidence only. Native package execution and hardware proof are never implied. Private integrations and archived historical applications are excluded from this package.
