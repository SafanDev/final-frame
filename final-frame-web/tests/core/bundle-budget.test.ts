import assert from "node:assert/strict";
import test from "node:test";
import { collectRouteAssetNames, evaluateSummary, extractClientReferenceAssetNames, summarizeBundleFiles } from "../../scripts/bundle-budget-core.mjs";

test("compressed and raw bundle ceilings are evaluated independently", () => {
  const summary = summarizeBundleFiles([
    { path: "a.js", content: Buffer.from("const value = 1;".repeat(100)) },
    { path: "b.js", content: Buffer.from("const value = 2;".repeat(100)) },
  ]);
  assert.equal(summary.files, 2);
  assert.ok(summary.gzipBytes < summary.bytes);
  assert.equal(evaluateSummary(summary, { maxBytes: summary.bytes, maxGzipBytes: summary.gzipBytes }, "JavaScript").length, 0);
  assert.equal(evaluateSummary(summary, { maxGzipBytes: summary.gzipBytes - 1 }, "JavaScript").length, 1);
});

test("route assets combine framework roots with the selected app entry", () => {
  assert.deepEqual(collectRouteAssetNames({
    buildManifest: { rootMainFiles: ["static/runtime.js"] },
    appBuildManifest: { pages: { "/page": ["static/home.js", "static/home.css"] } },
    manifestKeys: ["/page"],
  }), ["static/runtime.js", "static/home.js", "static/home.css"]);
});
test("client-reference assets include unique route JavaScript and CSS entries", () => {
  const manifest = {
    entryJSFiles: {
      layout: ["static/chunks/shared.js"],
      page: ["static/chunks/shared.js", "static/chunks/page.js"],
    },
    entryCSSFiles: {
      layout: [{ path: "static/chunks/global.css", inlined: false }],
      page: [{ path: "static/chunks/page.css", inlined: false }],
    },
  };
  const source =
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};` +
    `globalThis.__RSC_MANIFEST["/page"] = ${JSON.stringify(manifest)};`;

  assert.deepEqual(
    extractClientReferenceAssetNames(source, "/page"),
    [
      "static/chunks/shared.js",
      "static/chunks/page.js",
      "static/chunks/global.css",
      "static/chunks/page.css",
    ],
  );
});

test("client-reference parser rejects absent or malformed manifests", () => {
  assert.deepEqual(
    extractClientReferenceAssetNames("not a manifest", "/page"),
    [],
  );
  assert.deepEqual(
    extractClientReferenceAssetNames(
      'globalThis.__RSC_MANIFEST["/page"] = {broken};',
      "/page",
    ),
    [],
  );
});
