# Driver service contract

Every host adapter implements the same logical operations:

- probe
- install
- uninstall
- start
- stop
- publishDevice
- removeDevice
- status
- capabilities

`frameulatord` never calls host-native driver APIs directly. Privileged work is delegated to `frameulator-driver-service`.

Portable mode is a first-class fallback and is independent from native-device support.

The current Windows, Linux, and macOS adapters report native publication unavailable and fail closed. They must not advertise native-device capability until a real implementation and platform evidence exist.
