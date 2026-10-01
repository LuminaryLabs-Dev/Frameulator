# Security

Frameulator runs scenarios and verified Agora capsules inside the browser sandbox and has application networking disabled. A selected Flatpak is streamed only through local SHA-256 calculation; Frameulator does not upload or persist its bytes.

Only registries with a trusted Ed25519 key are accepted. A registry binds the exact Flatpak hash, capsule hash, source commit, application ID, version, and architecture. Never publish release private keys, credentials, private source, or device secrets in this repository, a profile, or an exported report.

Report security issues privately through the repository's GitHub security advisory interface. Do not open a public issue for a vulnerability.
