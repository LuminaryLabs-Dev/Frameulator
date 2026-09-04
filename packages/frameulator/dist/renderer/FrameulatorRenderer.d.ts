import type { ControllerState, Pose } from "../types";
export interface RenderSnapshot {
    headPose: Pose;
    controllers: Record<"left" | "right", ControllerState>;
    sessionState: string;
}
export declare class FrameulatorRenderer {
    private readonly container;
    private readonly scene;
    private readonly camera;
    private readonly renderer;
    private readonly head;
    private readonly controllers;
    private readonly observer;
    private previews?;
    private animationFrame;
    private destroyed;
    constructor(container: HTMLElement);
    setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement): void;
    update(snapshot: RenderSnapshot): void;
    destroy(): void;
    private buildHeadset;
    private buildController;
    private applyPose;
    private applyController;
    private resize;
    private animate;
    private copyPreviews;
}
