import type { FrameulatorOptions, RpcRequest, RpcResponse } from "./types";

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

export class WorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private requestId = 0;
  private blobUrl?: string;

  private constructor(worker: Worker, blobUrl?: string) {
    this.worker = worker;
    this.blobUrl = blobUrl;
    worker.addEventListener("message", (event: MessageEvent<RpcResponse>) => this.receive(event.data));
    worker.addEventListener("error", (event) => this.failAll(event.error ?? new Error(event.message)));
  }

  static async create(options: FrameulatorOptions): Promise<WorkerClient> {
    let worker: Worker;
    let blobUrl: string | undefined;
    if (options.workerUrl) {
      worker = new Worker(String(options.workerUrl), { name: "frameulator", type: "module" });
    } else {
      if (!__FRAMEULATOR_WORKER_SOURCE__) {
        throw new Error("Inline Worker code is unavailable; provide workerUrl or set worker to false.");
      }
      const blob = new Blob([__FRAMEULATOR_WORKER_SOURCE__], { type: "text/javascript" });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl, { name: "frameulator", type: "module" });
    }

    const client = new WorkerClient(worker, blobUrl);
    const embedded = __FRAMEULATOR_WASM_BASE64__;
    const hasExplicitSource = Boolean(options.wasmBytes || options.wasmBase64 || options.wasmUrl);
    await client.request("initialize", {
      profile: options.profile,
      wasmBytes: options.wasmBytes,
      wasmBase64: options.wasmBase64 || embedded,
      wasmUrl: hasExplicitSource || embedded ? options.wasmUrl : new URL("./frameulator.wasm", import.meta.url).href,
    });
    return client;
  }

  request(method: string, parameters?: unknown): Promise<any> {
    const requestId = ++this.requestId;
    const request: RpcRequest = { protocol: "frameulator/1", requestId, method, parameters };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Frameulator request timed out: ${method}`));
      }, 10_000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker.postMessage(request);
    });
  }

  destroy(): void {
    this.failAll(new Error("Frameulator Worker was destroyed."));
    this.worker.terminate();
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = undefined;
  }

  private receive(response: RpcResponse): void {
    if (response.protocol !== "frameulator/1") return;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error ?? "Unknown Frameulator Worker error."));
  }

  private failAll(error: unknown): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
