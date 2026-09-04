import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "packages/frameulator");
const maximumPublishedBytes = 200 * 1024 * 1024;

async function directorySize(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    total += entry.isDirectory() ? await directorySize(entryPath) : (await stat(entryPath)).size;
  }
  return total;
}

const required = [
  "dist/frameulator.js",
  "dist/frameulator.standalone.js",
  "dist/frameulator.worker.js",
  "dist/frameulator.wasm",
  "dist/frameulator.css",
  "dist/index.d.ts",
  "profiles/steam-frame.json",
  "README.md",
  "LICENSE",
];

for (const path of required) {
  const info = await stat(resolve(packageRoot, path));
  assert.ok(info.size > 0, `${path} must be non-empty`);
}

const standalone = await readFile(resolve(packageRoot, "dist/frameulator.standalone.js"), "utf8");
assert.doesNotMatch(standalone, /from\s*["'](?:three|https?:)/, "standalone build cannot have external imports");
assert.doesNotMatch(standalone, /(?:@latest|\/main(?:\/|["'])|refs\/heads\/main)/, "standalone build cannot depend on mutable versions");
assert.match(standalone, /frameulator/, "standalone build must contain Frameulator code");
assert.match(standalone, /agora-management\/2/, "standalone build must contain Agora management ABI 2");

const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
assert.equal(packageJson.name, "@luminarylabs/frameulator");
assert.equal(packageJson.version, "0.2.0");
assert.equal(packageJson.publishConfig.access, "public");

const packOutput = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: packageRoot,
  encoding: "utf8",
});
const pack = JSON.parse(packOutput)[0];
assert.ok(pack.files.some((file) => file.path === "dist/frameulator.standalone.js"));
assert.ok(pack.files.every((file) => !file.path.includes("node_modules")));
assert.ok(pack.files.every((file) => !/\.(?:pem|key|env)$/.test(file.path)));

const site = await readFile(resolve(root, "docs/index.html"), "utf8");
assert.match(site, /Frameulator/);
assert.doesNotMatch(site, /localhost/);
assert.doesNotMatch(site, /qemu|alpine-frameulator|SharedArrayBuffer/i);
assert.doesNotMatch(site, /class="(?:hero|contracts|site-header)"|<footer/i);
const siteSource = await readFile(resolve(root, "apps/web/index.html"), "utf8");
const siteCss = await readFile(resolve(root, "apps/web/src/site.css"), "utf8");
assert.match(siteSource, /<frameulator-lab/);
assert.doesNotMatch(siteSource, /class="(?:hero|contracts|site-header)"|<footer/i);
assert.match(siteCss, /html, body[^}]+overflow:\s*hidden/s);
const siteReleaseConfig = JSON.parse(await readFile(resolve(root, "docs/releases/config.json"), "utf8"));
assert.deepEqual(siteReleaseConfig, {
  schemaVersion: 1,
  enabled: false,
  releaseRegistry: null,
  trustedReleaseKey: null,
});

const publishedBytes = await directorySize(resolve(root, "docs"));
assert.ok(
  publishedBytes < maximumPublishedBytes,
  `static site is ${(publishedBytes / 1048576).toFixed(2)} MB; it must remain below 200 MB`,
);
const hostWasmBytes = (await stat(resolve(packageRoot, "dist/frameulator.wasm"))).size;
assert.ok(hostWasmBytes < 2 * 1024 * 1024, "Frameulator WASM must remain below 2 MB");
assert.ok(publishedBytes < 20 * 1024 * 1024, "normal initial site download must remain below 20 MB");

console.log(
  `release verification passed (${pack.files.length} packed files, ${(publishedBytes / 1048576).toFixed(2)} MB site)`,
);
