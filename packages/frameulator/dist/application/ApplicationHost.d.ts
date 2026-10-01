import type { FrameulatorOptions } from "../types";
/** Serialized per-instance dispatcher shared by local and Worker transports. */
export declare class ApplicationHost {
    private readonly kernel;
    private readonly factories;
    private adapter?;
    private selection?;
    private factory?;
    private state;
    private closed;
    private queue;
    private events;
    private sequence;
    private executed;
    private report?;
    private constructor();
    static create(options?: FrameulatorOptions): Promise<ApplicationHost>;
    request(method: string, parameters?: unknown): Promise<any>;
    private active;
    private clear;
    private record;
    private snapshot;
    private dispatch;
    private makeReport;
    destroy(): Promise<any>;
}
