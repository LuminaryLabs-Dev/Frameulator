# Frameulator monorepo architecture

Frameulator is a cross-platform virtual Steam Frame development device. The existing browser laboratory remains the lightweight simulation/evidence tier. The monorepo architecture adds a host-neutral device core, an unprivileged runtime service, a separately privileged driver service, host-specific driver adapters, Android and SteamOS runtime boundaries, a desktop control client, SDK, and versioned contracts.

## Process boundary

Normal-user components:
- Frameulator Desktop
- frameulatord

Privileged boundary:
- frameulator-driver-service
- host-specific native adapter

The runtime must work in portable mode without any native driver. Native device publication is optional and capability-gated.

## Ownership

- `core/`: host-neutral device, Android, SteamOS, XR, API, and protocol logic.
- `services/runtime/`: long-running emulator ownership, sessions, portable endpoints, telemetry.
- `services/driver-service/`: privilege boundary and native-driver lifecycle.
- `drivers/`: platform adapters. Current adapters deliberately fail closed.
- `runtimes/`: Android and SteamOS execution boundaries.
- `app/desktop/`: control-plane client only.
- `sdk/`: programmatic automation API.
- `schemas/`: process-boundary contracts.

## Evidence boundary

A contract, state model, portable endpoint, or adapter stub is not native-device evidence. Native device support becomes proven only after the platform implementation, installation, enumeration, transport, and cleanup tests pass on that host. Existing browser evidence remains simulation evidence.
