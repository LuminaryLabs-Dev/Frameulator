import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  Frameulator,
  ApplicationHost,
  sha256Bytes,
  NeutralPanelAdapter,
} from "../dist/frameulator.js";
const wasmBytes = await readFile(
  new URL("../dist/frameulator.wasm", import.meta.url),
);
const options = {
  wasmBytes,
  worker: false,
  renderer: "none",
  storage: "memory",
};
const selection = {
  adapterId: "neutral-panel",
  manifest: { id: "sample", name: "Sample", version: "1.0.0" },
};
const pointer = (phase) => ({
  type: "pointer",
  surfaceId: "surface.main",
  phase,
  x: 0.5,
  y: 0.5,
  button: 0,
});
test("registered generic app runs, receives pointer input, resets and disposes", async () => {
  const lab = await Frameulator.create(options);
  try {
    await assert.rejects(lab.start(), /APPLICATION_REQUIRED/);
    await lab.loadApplication(selection);
    assert.equal(lab.applicationState, "READY");
    await lab.start();
    await lab.step(16);
    const before = await lab.snapshot();
    await lab.input(pointer("down"));
    await lab.input(pointer("up"));
    const after = await lab.snapshot();
    assert.equal(after.application.data.count, 1);
    assert.notEqual(
      sha256Bytes(before.application.surfaces[0].rgba),
      sha256Bytes(after.application.surfaces[0].rgba),
    );
    const report = await lab.exportReport();
    assert.equal(report.schemaVersion, 3);
    assert.equal(report.applicationExecuted, true);
    assert.equal(report.application.signatureVerified, false);
    assert.equal(report.nativeExecutionProven, false);
    assert.equal(report.applicationAssertionsChecked, false);
    assert.equal(report.passed, false);
    await lab.stop();
    await lab.start();
    await lab.reset();
    assert.equal((await lab.snapshot()).application.data.count, 0);
    await lab.removeApplication();
    assert.equal((await lab.snapshot()).application, undefined);
    assert.equal(await lab.latestReport(), undefined);
  } finally {
    await lab.destroy();
  }
});
test("failed selection never retains a formerly accepted app", async () => {
  const lab = await Frameulator.create(options);
  await lab.loadApplication(selection);
  await lab.start();
  await assert.rejects(
    lab.loadApplication({ ...selection, adapterId: "unknown" }),
    /Unknown adapter/,
  );
  assert.equal((await lab.snapshot()).application, undefined);
  await assert.rejects(lab.start(), /APPLICATION_REQUIRED/);
  await lab.destroy();
});
test("input boundary rejects malformed data without mutation and clones snapshots", async () => {
  const lab = await Frameulator.create(options);
  await lab.loadApplication(selection);
  await lab.start();
  await assert.rejects(
    lab.input({ ...pointer("up"), x: NaN }),
    /finite|coordinates/,
  );
  await assert.rejects(
    lab.input({ ...pointer("up"), surfaceId: "missing" }),
    /Unknown/,
  );
  await assert.rejects(lab.step(1001), /Frame step/);
  const s = await lab.snapshot();
  s.application.data.count = 900;
  s.application.surfaces[0].rgba.fill(0);
  assert.equal((await lab.snapshot()).application.data.count, 0);
  assert.ok((await lab.snapshot()).application.surfaces[0].rgba.some((x) => x));
  await lab.destroy();
  await assert.rejects(lab.snapshot(), /destroyed/);
});
test("instances are isolated and queued interactions are deterministic", async () => {
  const a = await Frameulator.create(options),
    b = await Frameulator.create(options);
  await Promise.all([
    a.loadApplication(selection),
    b.loadApplication(selection),
  ]);
  await Promise.all([a.start(), b.start()]);
  await Promise.all(
    Array.from({ length: 10 }, () => a.action("sample.advance")),
  );
  assert.equal((await a.snapshot()).application.data.count, 10);
  assert.equal((await b.snapshot()).application.data.count, 0);
  await Promise.all([a.destroy(), b.destroy()]);
});
test("malformed adapter surfaces fail at trust boundary and dispose", async () => {
  let disposed = false;
  const factory = {
    id: "bad",
    version: "1.0.0",
    source: { kind: "builtin", version: "test" },
    create() {
      return {
        ...NeutralPanelAdapter.create({}),
        snapshot() {
          return {
            data: {},
            surfaces: [
              {
                id: "surface",
                width: 100000,
                height: 2,
                rgba: new Uint8Array(0),
                revision: 0,
              },
            ],
          };
        },
        dispose() {
          disposed = true;
        },
      };
    },
  };
  const lab = await Frameulator.create({ ...options, adapters: [factory] });
  await assert.rejects(
    lab.loadApplication({ ...selection, adapterId: "bad" }),
    /surface dimensions/,
  );
  assert.equal(disposed, true);
  await lab.destroy();
});
test("shared dispatcher supports repeated host creation and generic source provenance", async () => {
  const host = await ApplicationHost.create(options);
  await host.request("loadApplication", selection);
  await host.request("start");
  const report = await host.request("runScenario", "normal-session");
  assert.equal(report.host.passed, true);
  assert.equal(report.applicationAssertionsChecked, false);
  await host.destroy();
  await assert.rejects(host.request("snapshot"), /destroyed/);
});

test("failed execution revokes cached and persisted success before reporting current state", async () => {
  let fail = false;
  const factory = {
    ...NeutralPanelAdapter,
    id: "failure-probe",
    create(context) {
      const inner = NeutralPanelAdapter.create(context);
      return {
        ...inner,
        step() {
          if (fail) throw Error("intentional step failure");
        },
      };
    },
  };
  const lab = await Frameulator.create({ ...options, adapters: [factory] });
  await lab.loadApplication({ ...selection, adapterId: factory.id });
  await lab.start();
  assert.equal((await lab.runScenario("normal-session")).passed, true);
  fail = true;
  await assert.rejects(lab.step(16), /intentional/);
  assert.equal(await lab.latestReport(), undefined);
  assert.equal(lab.applicationState, "FAILED");
  const report = await lab.exportReport();
  assert.equal(report.application.state, "FAILED");
  assert.equal(report.passed, false);
  await lab.destroy();
});
test("rejected action or input cannot retain a previous passing report", async () => {
  const lab = await Frameulator.create(options);
  await lab.loadApplication(selection);
  await lab.start();
  await lab.runScenario("normal-session");
  await assert.rejects(lab.action("unsupported"), /Unknown sample action/);
  assert.equal((await lab.exportReport()).passed, false);
  await lab.runScenario("normal-session");
  await assert.rejects(lab.input({ ...pointer("up"), x: 2 }), /coordinates/);
  assert.equal((await lab.exportReport()).passed, false);
  await lab.destroy();
});

test("teardown failure leaves application host terminal and cannot reload", async () => {
  const adapter = {
    ...NeutralPanelAdapter,
    id: "dispose-failure",
    create(c) {
      const inner = NeutralPanelAdapter.create(c);
      return {
        ...inner,
        dispose() {
          inner.dispose();
          throw Error("dispose failed");
        },
      };
    },
  };
  const host = await ApplicationHost.create({
    ...options,
    adapters: [adapter],
  });
  await host.request("loadApplication", {
    ...selection,
    adapterId: adapter.id,
  });
  await assert.rejects(host.destroy(), /dispose failed/);
  await assert.rejects(host.request("loadApplication", selection), /destroyed/);
  await assert.rejects(host.request("snapshot"), /destroyed/);
});
