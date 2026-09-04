import type { ControllerState, FrameulatorProfile, Pose, ServiceName, ServiceStatus } from "./types";

export interface SimulationWorld {
  headPose: Pose;
  controllers: Record<"left" | "right", ControllerState>;
  trackingAvailable: boolean;
  compositorFrames: number;
  firmwareState: "booted" | "updating" | "fault";
}

export const NeutralPose: Pose = {
  position: [0, 1.65, 0],
  orientation: [0, 0, 0, 1],
};

export function createWorld(): SimulationWorld {
  return {
    headPose: structuredClone(NeutralPose),
    controllers: {
      left: { pose: { position: [-0.25, 1.25, -0.35], orientation: [0, 0, 0, 1] } },
      right: { pose: { position: [0.25, 1.25, -0.35], orientation: [0, 0, 0, 1] } },
    },
    trackingAvailable: true,
    compositorFrames: 0,
    firmwareState: "booted",
  };
}

export function serviceStatuses(): Record<ServiceName, ServiceStatus> {
  const details: Record<ServiceName, string> = {
    hardware: "ARM64 ABI, memory and timing contract model",
    gpu: "Qualcomm/Adreno capability and budget model",
    vulkan: "Vulkan-like resource and submission validator",
    openxr: "OpenXR 1.1 session and action state machine",
    compositor: "Gamescope-like focus, pacing and frame queue model",
    firmware: "Deterministic headset firmware lifecycle model",
    tracking: "Synthetic pose, drift, prediction and loss model",
    controllers: "Virtual Steam Frame controller actions",
    host: "In-browser service and socket contract message bus",
  };
  return Object.fromEntries(
    Object.entries(details).map(([name, detail]) => [name, { name, status: "simulated", simulated: true, detail }]),
  ) as Record<ServiceName, ServiceStatus>;
}

export function queryService(
  method: string,
  profile: FrameulatorProfile,
  world: SimulationWorld,
): unknown {
  switch (method) {
    case "hardware.capabilities":
      return { ...profile.hardware, littleEndian: true, simulated: true };
    case "gpu.capabilities":
      return { ...profile.gpu, maxImageDimension2D: 8192, simulated: true };
    case "vulkan.capabilities":
      return { apiVersion: "1.3", queues: ["graphics", "compute", "transfer"], nativeDriver: false, simulated: true };
    case "openxr.capabilities":
      return { ...profile.openxr, sessionStateModel: true, nativeRuntime: false, simulated: true };
    case "compositor.status":
      return { queuedFrames: 0, presentedFrames: world.compositorFrames, focused: true, simulated: true };
    case "firmware.status":
      return { state: world.firmwareState, version: "simulated-0.2.0", hardwareFirmware: false, simulated: true };
    case "tracking.status":
      return { available: world.trackingAvailable, pose: world.headPose, source: "synthetic", simulated: true };
    case "controllers.status":
      return { connected: ["left", "right"], states: world.controllers, physicalControllers: false, simulated: true };
    case "host.status":
      return { transport: "worker-message-bus", nativeSockets: false, services: 9, simulated: true };
    case "services.status":
      return serviceStatuses();
    default:
      throw new Error(`Unsupported Frameulator method: ${method}`);
  }
}

