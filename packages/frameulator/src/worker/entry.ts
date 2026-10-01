import { ApplicationHost } from "../application/ApplicationHost";
import type { RpcRequest, RpcResponse } from "../types";
let host: ApplicationHost | undefined;
let queue: Promise<unknown> = Promise.resolve();
self.addEventListener("message", (event: MessageEvent<RpcRequest>) => {
  const request = event.data;
  queue = queue
    .then(async () => {
      const response: RpcResponse = {
        protocol: "frameulator/2",
        requestId: request?.requestId,
        ok: true,
      };
      try {
        if (
          request?.protocol !== "frameulator/2" ||
          !Number.isSafeInteger(request.requestId) ||
          typeof request.method !== "string"
        )
          throw Error("Invalid Frameulator Worker request");
        if (request.method === "initialize") {
          if (host) throw Error("Already initialized");
          host = await ApplicationHost.create(request.parameters ?? {});
          response.result = await host.request("snapshot");
        } else {
          if (!host) throw Error("Worker not initialized");
          response.result = await host.request(
            request.method,
            request.parameters,
          );
        }
      } catch (error) {
        response.ok = false;
        response.error = error instanceof Error ? error.message : String(error);
      }
      self.postMessage(response);
    })
    .catch(() => {});
});
