import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
const wasmBytes = await readFile(
  new URL("../dist/frameulator.wasm", import.meta.url),
);
async function workerHarness() {
  const url = new URL("../dist/frameulator.worker.js", import.meta.url).href;
  const worker = new Worker(
    new URL(
      "data:text/javascript," +
        encodeURIComponent(
          `import {parentPort} from 'node:worker_threads';globalThis.self={addEventListener(type,fn){if(type==='message')parentPort.on('message',data=>fn({data}))},postMessage(data){parentPort.postMessage(data)}};await import(${JSON.stringify(url)});parentPort.postMessage({ready:true});`,
        ),
    ),
  );
  let id = 0;
  const pending = new Map();
  await new Promise((res, rej) => {
    worker.once("error", rej);
    worker.once("message", res);
  });
  worker.on("message", (r) => {
    const p = pending.get(r.requestId);
    if (p) {
      pending.delete(r.requestId);
      r.ok ? p.resolve(r.result) : p.reject(Error(r.error));
    }
  });
  return {
    call(method, parameters) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        worker.postMessage({
          protocol: "frameulator/2",
          requestId,
          method,
          parameters,
        });
      });
    },
    close: () => worker.terminate(),
  };
}
test("actual bundled Worker dispatches generic lifecycle and input in isolation", async () => {
  const h = await workerHarness();
  try {
    await h.call("initialize", { wasmBytes });
    await h.call("loadApplication", {
      adapterId: "neutral-panel",
      manifest: { id: "worker-app", name: "Worker app", version: "1.0.0" },
    });
    await h.call("start");
    const calls = Array.from({ length: 8 }, () =>
      h.call("action", { name: "sample.advance" }),
    );
    await Promise.all(calls);
    assert.equal((await h.call("snapshot")).application.data.count, 8);
    await h.call("reset");
    assert.equal((await h.call("snapshot")).application.data.count, 0);
    await h.call("removeApplication");
    assert.equal((await h.call("snapshot")).application, undefined);
    await h.call("destroy");
    await assert.rejects(h.call("start"), /destroyed/);
  } finally {
    await h.close();
  }
});

test("adapter surface extras cannot leak or break the actual Worker clone boundary", async () => {
  const moduleUrl = new URL("../dist/frameulator.js", import.meta.url).href;
  const code = `import {parentPort} from 'node:worker_threads';import {ApplicationHost,NeutralPanelAdapter} from ${JSON.stringify(moduleUrl)};parentPort.once('message',async wasmBytes=>{let host;try{const factory={...NeutralPanelAdapter,id:'extra-probe',create(c){const inner=NeutralPanelAdapter.create(c);return {...inner,snapshot(){const s=inner.snapshot();s.surfaces[0].unexpected={callback(){},huge:'x'.repeat(1000000)};return s}}}};host=await ApplicationHost.create({wasmBytes,adapters:[factory]});await host.request('loadApplication',{adapterId:'extra-probe',manifest:{id:'probe',name:'Probe',version:'1.0.0'}});parentPort.postMessage(await host.request('snapshot'))}catch(error){parentPort.postMessage({error:error.message})}finally{await host?.destroy()}});`;
  const worker = new Worker(
    new URL("data:text/javascript," + encodeURIComponent(code)),
  );
  try {
    const snapshot = await new Promise((resolve, reject) => {
      worker.once("error", reject);
      worker.once("message", resolve);
      worker.postMessage(wasmBytes);
    });
    assert.equal(snapshot.error, undefined);
    assert.deepEqual(Object.keys(snapshot.application.surfaces[0]).sort(), [
      "height",
      "id",
      "revision",
      "rgba",
      "visible",
      "width",
    ]);
    assert.ok(snapshot.application.surfaces[0].rgba instanceof Uint8Array);
  } finally {
    await worker.terminate();
  }
});
