# Architecture

The generic ApplicationHost owns one application instance and the independent FrameulatorKernel. A shared serialized dispatcher is used by local transport and the browser Worker. Explicit adapter factories are trusted host code; there is no dynamic user-code loader.

Adapters own application logic. They implement start, stop, reset, step, input, snapshot and dispose, with optional named actions. The renderer consumes bounded RGBA surfaces without product branches. The neutral sample is an independently authored browser-compatible adapter. External application integrations are verified separately and are not included in this public repository.

Hash/signature verification is independent of JS injection. The signed-package gate verifies identity and artifact bytes but never executes a native binary. Legacy product ABI remains archived unchanged.

Schema 3 reports distinguish host-kernel assertions, application execution and externally supplied native reports. Interactive snapshots and successful kernel scenarios do not claim application correctness. Headset poses, services, stereo previews and application presentation are simulation only.
