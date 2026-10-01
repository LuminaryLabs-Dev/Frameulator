import { FrameulatorKernel } from "../FrameulatorKernel";
import type { ManagementCommand, RpcRequest, RpcResponse } from "../types";
import { BrowserCapsule, applyCapsuleEvent, applyManagementCommand, runCapsuleScenario } from "../application/BrowserCapsule";

let kernel: FrameulatorKernel | undefined;
let capsule: BrowserCapsule | undefined;

async function dispatch(request: RpcRequest): Promise<unknown> {
  if (request.protocol !== "frameulator/2") throw new Error("Frameulator Worker protocol 2 is required.");
  if (request.method === "initialize") {
    kernel = await FrameulatorKernel.create((request.parameters ?? {}) as never);
    return { ...kernel.snapshot, profile: kernel.profile, wasmAbi: 1 };
  }
  if (!kernel) throw new Error("Frameulator Worker is not initialized.");

  switch (request.method) {
    case "loadCapsule":
      capsule = await BrowserCapsule.create(request.parameters as Uint8Array);
      return capsule.snapshot;
    case "prepareRelease":
      if (!capsule) throw new Error("Agora capsule is not loaded.");
      capsule.prepareRelease(Number(request.parameters) || 1);
      return { ...kernel.snapshot, applicationFrame: capsule.snapshot };
    case "managementCommand": {
      if (!capsule) throw new Error("Agora capsule is not loaded.");
      const { command, value } = request.parameters as { command: ManagementCommand; value?: number };
      applyManagementCommand(capsule, command, value);
      if (command === "launch") kernel.start();
      if (command === "stop") { kernel.stop(); kernel.step(0); }
      if (command === "crash") kernel.injectEvent("runtime-exit");
      if (command === "recover" || command === "remove") kernel.reset();
      return { ...kernel.snapshot, applicationFrame: capsule.snapshot };
    }
    case "unloadCapsule":
      capsule = undefined;
      return { unloaded: true };
    case "start":
      capsule?.start();
      return { state: kernel.start(), applicationFrame: capsule?.snapshot };
    case "stop":
      capsule?.stop();
      return { state: kernel.stop(), applicationFrame: capsule?.snapshot };
    case "step":
      kernel.step(Number(request.parameters));
      capsule?.step(Number(request.parameters));
      return { ...kernel.snapshot, applicationFrame: capsule?.snapshot };
    case "setHeadPose":
      kernel.setHeadPose(request.parameters as never);
      return kernel.snapshot;
    case "setControllerState": {
      const { hand, state } = request.parameters as { hand: "left" | "right"; state: never };
      kernel.setControllerState(hand, state);
      return kernel.snapshot;
    }
    case "injectEvent":
      if (capsule) applyCapsuleEvent(capsule, request.parameters as never);
      kernel.injectEvent(request.parameters as never);
      return { ...kernel.snapshot, state: kernel.sessionState, applicationFrame: capsule?.snapshot };
    case "runScenario":
      return {
        report: await kernel.runScenario(request.parameters as never),
        applicationFrame: capsule ? runCapsuleScenario(capsule, request.parameters as never) : undefined,
      };
    case "exportReport":
      return kernel.exportReport();
    case "snapshot":
      return { ...kernel.snapshot, applicationFrame: capsule?.snapshot };
    default:
      return kernel.call(request.method);
  }
}

self.addEventListener("message", async (event: MessageEvent<RpcRequest>) => {
  const request = event.data;
  const response: RpcResponse = {
    protocol: "frameulator/2",
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
