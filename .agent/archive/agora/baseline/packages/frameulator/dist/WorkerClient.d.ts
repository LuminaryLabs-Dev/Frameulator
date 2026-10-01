import type { FrameulatorOptions } from "./types";
export declare class WorkerClient {
    private readonly worker;
    private readonly pending;
    private requestId;
    private blobUrl?;
    private constructor();
    static create(options: FrameulatorOptions): Promise<WorkerClient>;
    request(method: string, parameters?: unknown): Promise<any>;
    destroy(): void;
    private receive;
    private failAll;
}
