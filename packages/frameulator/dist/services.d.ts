import type { ControllerState, FrameulatorProfile, Pose, ServiceName, ServiceStatus } from "./types";
export interface SimulationWorld {
    headPose: Pose;
    controllers: Record<"left" | "right", ControllerState>;
    trackingAvailable: boolean;
    compositorFrames: number;
    firmwareState: "booted" | "updating" | "fault";
}
export declare const NeutralPose: Pose;
export declare function createWorld(): SimulationWorld;
export declare function serviceStatuses(): Record<ServiceName, ServiceStatus>;
export declare function queryService(method: string, profile: FrameulatorProfile, world: SimulationWorld): unknown;
