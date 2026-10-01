import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

for (const relative of ["docs", "packages/frameulator/dist", "packages/frameulator/wasm"]) {
  await rm(resolve(root, relative), { recursive: true, force: true });
}

