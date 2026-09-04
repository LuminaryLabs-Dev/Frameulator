export interface KernelExports extends WebAssembly.Exports {
    frameulator_reset(): void;
    frameulator_start(): number;
    frameulator_stop(): number;
    frameulator_step(deltaMicros: number): number;
    frameulator_inject_event(event: number): number;
    frameulator_session_state(): number;
    frameulator_frame_count(): bigint;
    frameulator_elapsed_micros(): bigint;
    frameulator_event_count(): number;
    frameulator_abi_version(): number;
}
export declare function instantiateKernel(options: {
    wasmBytes?: ArrayBuffer | Uint8Array;
    wasmBase64?: string;
    wasmUrl?: string | URL;
}): Promise<KernelExports>;
