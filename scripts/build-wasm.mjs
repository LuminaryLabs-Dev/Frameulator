import { chmod, copyFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const crate = resolve(root, "packages/frameulator/rust");
const outputDirectory = resolve(root, "packages/frameulator/wasm");
const source = resolve(crate, "target/wasm32-unknown-unknown/release/frameulator_kernel.wasm");
const destination = resolve(outputDirectory, "frameulator.wasm");

execFileSync("cargo", ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown"], {
  cwd: crate,
  stdio: "inherit",
});

await mkdir(outputDirectory, { recursive: true });
await copyFile(source, destination);
await chmod(destination, 0o644);
