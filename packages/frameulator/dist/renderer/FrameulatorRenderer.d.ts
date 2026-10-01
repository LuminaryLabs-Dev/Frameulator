import type { ControllerState, Pose } from "../types";
export interface RenderSurface {
    id: string;
    width: number;
    height: number;
    rgba: Uint8Array;
    revision: number;
    visible?: boolean;
}
/** Pointer coordinates use the same top-left origin as surface RGBA rows. */
export interface SurfacePointerInput {
    type: "pointer";
    surfaceId: string;
    phase: "down" | "move" | "up" | "cancel";
    x: number;
    y: number;
    button: number;
}
export interface RenderSnapshot {
    headPose: Pose;
    controllers: Record<"left" | "right", ControllerState>;
    sessionState: string;
    applicationFrame?: {
        surfaces: RenderSurface[];
    };
}
/** Device visualization only: application pixels are supplied by an adapter. */
export declare class FrameulatorRenderer {
    private readonly container;
    private readonly scene;
    private readonly camera;
    private readonly renderer;
    private readonly head;
    private readonly controllers;
    private readonly observer;
    private readonly surfaceViews;
    private readonly raycaster;
    private readonly eyeCamera;
    private readonly eyeTargets;
    private readonly eyePixels;
    private previews?;
    private inputHandler?;
    private capturedPointer?;
    private animationFrame;
    private destroyed;
    constructor(container: HTMLElement);
    setEyePreviews(left: HTMLCanvasElement, right: HTMLCanvasElement): void;
    setInputHandler(handler?: (input: SurfacePointerInput) => void): void;
    update(snapshot: RenderSnapshot): void;
    clearApplicationFrame(): void;
    destroy(): void;
    private updateSurfaces;
    private disposeSurface;
    private handlePointer;
    private handleLostCapture;
    private cancelPointer;
    private buildHeadset;
    private buildController;
    private applyPose;
    private applyController;
    private resize;
    private animate;
    private copyPreviews;
}
