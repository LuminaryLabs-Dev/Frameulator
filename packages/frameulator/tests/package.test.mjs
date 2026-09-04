import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("package metadata is exact and public", async () => {
  const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(metadata.name, "@luminarylabs/frameulator");
  assert.equal(metadata.version, "0.2.0");
  assert.equal(metadata.publishConfig.access, "public");
  assert.equal(metadata.dependencies.three, "0.179.1");
});

test("standalone artifact is self-contained ESM", async () => {
  const source = await readFile(new URL("../dist/frameulator.standalone.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s*["'](?:three|https?:)/);
  assert.match(source, /frameulator\/2/);
  assert.ok(source.length > 100_000, "standalone should contain Three.js, Worker code and WASM");
});
