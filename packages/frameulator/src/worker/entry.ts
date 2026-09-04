import { FrameulatorKernel } from "../FrameulatorKernel";
import type { RpcRequest, RpcResponse } from "../types";

let kernel: FrameulatorKernel | undefined;

async function dispatch(request: RpcRequest): Promise<unknown> {
  if (request.method === "initialize") {
    kernel = await FrameulatorKernel.create((request.parameters ?? {}) as never);
    return { ...kernel.snapshot, profile: kernel.profile, wasmAbi: 1 };
  }
  if (!kernel) throw new Error("Frameulator Worker is not initialized.");

  switch (request.method) {
    case "start":
      return { state: kernel.start() };
    case "stop":
      return { state: kernel.stop() };
    case "step":
      kernel.step(Number(request.parameters));
      return kernel.snapshot;
    case "setHeadPose":
      kernel.setHeadPose(request.parameters as never);
      return kernel.snapshot;
    case "setControllerState": {
      const { hand, state } = request.parameters as { hand: "left" | "right"; state: never };
      kernel.setControllerState(hand, state);
      return kernel.snapshot;
    }
    case "injectEvent":
      return { state: kernel.injectEvent(request.parameters as never) };
    case "runScenario":
      return kernel.runScenario(request.parameters as never);
    case "exportReport":
      return kernel.exportReport();
    case "snapshot":
      return kernel.snapshot;
    default:
      return kernel.call(request.method);
  }
}

self.addEventListener("message", async (event: MessageEvent<RpcRequest>) => {
  const request = event.data;
  const response: RpcResponse = {
    protocol: "frameulator/1",
    requestId: request.requestId,
    ok: true,
  };
  try {
    response.result = await dispatch(request);
  } catch (error) {
    response.ok = false;
    response.error = error instanceof Error ? error.message : String(error);
  }
  self.postMessage(response);
});

