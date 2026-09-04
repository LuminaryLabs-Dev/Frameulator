import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);

test("the website is a single-screen workbench instead of a landing page", async () => {
  const [html, siteCss, element, elementCss] = await Promise.all([
    readFile(new URL("apps/web/index.html", root), "utf8"),
    readFile(new URL("apps/web/src/site.css", root), "utf8"),
    readFile(new URL("packages/frameulator/src/element/frameulator-element.ts", root), "utf8"),
    readFile(new URL("packages/frameulator/src/styles.css", root), "utf8"),
  ]);
  assert.match(html, /<frameulator-lab/);
  assert.doesNotMatch(html, /class="(?:hero|contracts|site-header)"|<footer/);
  assert.match(siteCss, /html, body[^}]+overflow:\s*hidden/s);
  assert.match(siteCss, /height:\s*100dvh/);
  for (const section of ["package", "device", "deploy", "session", "tests", "evidence"]) {
    assert.match(element, new RegExp(`"${section}"`));
  }
  assert.match(element, /Ctrl|metaKey|ctrlKey/);
  assert.match(element, /navigator\.getGamepads/);
  assert.match(elementCss, /button \{ min-height: 44px/);
  assert.match(elementCss, /prefers-reduced-motion/);
});

test("browser proof labels do not imply native Flatpak execution", async () => {
  const element = await readFile(new URL("packages/frameulator/src/element/frameulator-element.ts", root), "utf8");
  assert.match(element, /F1\/F2/);
  assert.match(element, /Native install/);
  assert.match(element, /Not executed here/);
  assert.match(element, /Physical Frame/);
});
