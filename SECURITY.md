# Security model

Frameulator executes only bundled adapters or explicitly injected, reviewed host JavaScript. Injection is trusted code with the host's authority; it is not a hostile-code sandbox. A Worker alone cannot enforce network isolation. The static demo CSP restricts scripts/workers and connections to same-origin host assets. The networking option is a trusted-adapter contract, not a hostile-code firewall: injected host code retains authority. Integrations must supply an equally restrictive hosting policy.

No arbitrary source upload, dynamic module URL, eval or native package execution is supported. Signed package verification is separate: Ed25519 trusted key signatures bind exact validated release descriptors; SHA-256 binds locally streamed package bytes and bounded fetched artifacts. Verification never executes those bytes. Package data is not uploaded or persisted.

Lifecycle requests serialize, snapshots are copied, input and output sizes are bounded, and failed selection clears prior application state. A trusted adapter can still hang or misbehave; use a separately reviewed Worker integration for code that may block, and never inject unknown code.

Reports label simulation, source identity and trust mode. Imported native reports are externally supplied assertions, not independently verified hardware evidence. Do not place secrets in application manifests, config or report data.
