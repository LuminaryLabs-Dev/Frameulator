import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Frameulator, FrameulatorKernel, createScenario } from "../dist/frameulator.js";

const wasmBytes = await readFile(new URL("../dist/frameulator.wasm", import.meta.url));

test("Rust/WASM kernel reaches a focused OpenXR-style state", async () => {
  const kernel = await FrameulatorKernel.create({ wasmBytes });
  const report = await kernel.runScenario("normal-session");
  assert.equal(report.passed, true);
  assert.equal(report.sessionState, "FOCUSED");
  assert.equal(report.frameCount, 3);
  assert.equal(report.simulated, true);
  assert.equal(report.evidenceLevel, "F1-browser-wasm");
});

test("tracking loss and recovery are deterministic", async () => {
  const kernel = await FrameulatorKernel.create({ wasmBytes });
  const report = await kernel.runScenario("tracking-recovery");
  assert.equal(report.passed, true);
  assert.deepEqual(report.assertions.map((item) => item.actual), ["LOSS_PENDING", "FOCUSED"]);
});

test("all nine service contracts respond and stay labeled simulated", async () => {
  const kernel = await FrameulatorKernel.create({ wasmBytes });
  const methods = [
    "hardware.capabilities",
    "gpu.capabilities",
    "vulkan.capabilities",
    "openxr.capabilities",
    "compositor.status",
    "firmware.status",
    "tracking.status",
    "controllers.status",
    "host.status",
  ];
  for (const method of methods) {
    const response = kernel.call(method);
    assert.equal(response.simulated, true, `${method} must be labeled simulated`);
  }
  assert.equal(Object.keys(kernel.call("services.status")).length, 9);
});

test("custom scenarios validate their identifier and assertions", async () => {
  const kernel = await FrameulatorKernel.create({ wasmBytes });
  const scenario = createScenario("stop-session", [
    { action: "start" },
    { action: "stop" },
    { action: "assert-state", state: "STOPPING" },
  ]);
  assert.equal((await kernel.runScenario(scenario)).passed, true);
  assert.throws(() => createScenario("Not Valid", [{ action: "start" }]));
});

test("native evidence remains separate from browser simulation", async () => {
  const kernel = await FrameulatorKernel.create({ wasmBytes });
  const lab = await Frameulator.create({ wasmBytes, worker: false, renderer: "none", storage: "memory" });
  const base = await kernel.runScenario("normal-session");
  const simulation = {
    ...base,
    application: {
      flatpakUploaded: true,
      flatpakHashVerified: true,
      matchingAgoraCodeExecuted: true,
      executionMode: "browser-wasm-capsule",
      nativeFlatpakInstalled: false,
      nativeFlatpakExecuted: false,
      hardwareSimulated: true,
      appId: "dev.luminarylabs.Agora",
      version: "0.0.1",
      architecture: "x86_64",
      sourceCommit: "1".repeat(40),
      flatpakSha256: "2".repeat(64),
      browserWasmSha256: "3".repeat(64),
    },
  };
  const native = await lab.importEvidence({
    schemaVersion: 1,
    simulated: false,
    evidenceLevel: "F3-native-vulkan",
    producer: "fixture-native-runner",
    scenario: "normal-session",
    passed: true,
    generatedAt: "2026-09-04T00:00:00.000Z",
  });
  const comparison = lab.compareEvidence({ simulation, native });
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.simulationLevel, "F1-browser-wasm");
  assert.equal(comparison.nativeLevel, "F3-native-vulkan");
  await lab.destroy();
});
