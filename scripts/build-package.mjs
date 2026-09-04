import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "packages/frameulator");
const dist = resolve(packageRoot, "dist");
const wasmPath = resolve(packageRoot, "wasm/frameulator.wasm");
const wasmBase64 = (await readFile(wasmPath)).toString("base64");

await mkdir(dist, { recursive: true });

const workerBuild = await build({
  entryPoints: [resolve(packageRoot, "src/worker/entry.ts")],
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  define: {
    __FRAMEULATOR_WASM_BASE64__: JSON.stringify(""),
    __FRAMEULATOR_WORKER_SOURCE__: JSON.stringify(""),
  },
});
const workerSource = workerBuild.outputFiles[0].text;
await writeFile(resolve(dist, "frameulator.worker.js"), workerSource);

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: resolve(dist, "frameulator.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  sourcemap: true,
  external: ["three"],
  loader: { ".css": "text" },
  define: {
    __FRAMEULATOR_WASM_BASE64__: JSON.stringify(""),
    __FRAMEULATOR_WORKER_SOURCE__: JSON.stringify(workerSource),
  },
  banner: { js: "/* Frameulator 0.1.0 | MIT */" },
});

await build({
  entryPoints: [resolve(packageRoot, "src/standalone.ts")],
  outfile: resolve(dist, "frameulator.standalone.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "eof",
  loader: { ".css": "text" },
  define: {
    __FRAMEULATOR_WASM_BASE64__: JSON.stringify(wasmBase64),
    __FRAMEULATOR_WORKER_SOURCE__: JSON.stringify(workerSource),
  },
  banner: { js: "/* Frameulator 0.1.0 standalone | MIT */" },
});

await copyFile(wasmPath, resolve(dist, "frameulator.wasm"));
await chmod(resolve(dist, "frameulator.wasm"), 0o644);
await copyFile(resolve(packageRoot, "src/styles.css"), resolve(dist, "frameulator.css"));

const tsc = resolve(root, "node_modules/.bin/tsc");
execFileSync(tsc, ["-p", resolve(packageRoot, "tsconfig.build.json")], {
  cwd: root,
  stdio: "inherit",
});
