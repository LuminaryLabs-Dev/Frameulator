import { chmod, copyFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const crate = resolve(root, "packages/frameulator/rust");
const outputDirectory = resolve(root, "packages/frameulator/wasm");
const source = resolve(crate, "target/wasm32-unknown-unknown/release/frameulator_kernel.wasm");
const destination = resolve(outputDirectory, "frameulator.wasm");
const testCapsuleSource = resolve(root, "packages/frameulator/tests/fixtures/agora-test-capsule.rs");
const testCapsule = resolve(root, "packages/frameulator/tests/fixtures/agora-test-capsule.wasm");

execFileSync("cargo", ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown"], {
  cwd: crate,
  stdio: "inherit",
});

await mkdir(outputDirectory, { recursive: true });
await copyFile(source, destination);
await chmod(destination, 0o644);

execFileSync("rustc", [
  "--edition", "2021",
  "--crate-type", "cdylib",
  "--target", "wasm32-unknown-unknown",
  "-C", "opt-level=z",
  "-C", "panic=abort",
  "-o", testCapsule,
  testCapsuleSource,
], { cwd: root, stdio: "inherit" });
await chmod(testCapsule, 0o644);
