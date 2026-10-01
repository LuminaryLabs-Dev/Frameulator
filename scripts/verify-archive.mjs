import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = new URL("../.agent/archive/agora/", import.meta.url),
  manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
for (const file of manifest.files) {
  const bytes = await readFile(new URL(`baseline/${file.path}`, root));
  assert.equal(bytes.length, file.size, file.path);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    file.sha256,
    file.path,
  );
  assert.equal(
    createHash("sha1")
      .update(Buffer.from(`blob ${bytes.length}\0`))
      .update(bytes)
      .digest("hex"),
    file.gitBlob,
    file.path,
  );
}
async function list(url, prefix = "") {
  const paths = [];
  for (const e of await readdir(url, { withFileTypes: true })) {
    const name = prefix + e.name;
    if (e.isDirectory())
      paths.push(...(await list(new URL(e.name + "/", url), name + "/")));
    else paths.push(name);
  }
  return paths;
}
assert.deepEqual(
  (await list(new URL("baseline/", root))).sort(),
  manifest.files.map((f) => f.path).sort(),
);
console.log(
  `Archive verified: ${manifest.files.length} exact files from ${manifest.sourceCommit}`,
);
