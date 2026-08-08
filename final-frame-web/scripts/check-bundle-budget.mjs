#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { collectRouteAssetNames, evaluateSummary, extractClientReferenceAssetNames, summarizeBundleFiles } from "./bundle-budget-core.mjs";

const nextDir = ".next";
if (!existsSync(nextDir)) {
  console.error("Missing .next output. Run npm run build before the bundle budget check.");
  process.exit(1);
}

const config = JSON.parse(readFileSync("performance-budgets.json", "utf8"));
const files = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else files.push({ path: relative(nextDir, path), bytes: stat.size, content: readFileSync(path) });
  }
}
walk(join(nextDir, "static"));

const js = files.filter((file) => extname(file.path) === ".js");
const css = files.filter((file) => extname(file.path) === ".css");
const jsSummary = summarizeBundleFiles(js);
const cssSummary = summarizeBundleFiles(css);
const errors = [
  ...evaluateSummary(jsSummary, config.global.javascript, "Global JavaScript"),
  ...evaluateSummary(cssSummary, config.global.css, "Global CSS"),
];

const buildManifest = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8"));
const appBuildManifestPath = join(nextDir, "app-build-manifest.json");
const appBuildManifest = existsSync(appBuildManifestPath)
  ? JSON.parse(readFileSync(appBuildManifestPath, "utf8"))
  : null;

function collectConfiguredRouteAssetNames(manifestKeys) {
  const legacyNames = appBuildManifest
    ? collectRouteAssetNames({
        buildManifest,
        appBuildManifest,
        manifestKeys,
      })
    : [];

  if (legacyNames.length > 0) return legacyNames;

  const routeNames = manifestKeys.flatMap((manifestKey) => {
    const normalizedKey = manifestKey
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    const manifestPath = join(
      nextDir,
      "server",
      "app",
      `${normalizedKey}_client-reference-manifest.js`,
    );

    if (!existsSync(manifestPath)) return [];

    return extractClientReferenceAssetNames(
      readFileSync(manifestPath, "utf8"),
      manifestKey,
    );
  });

  return Array.from(
    new Set([
      ...(buildManifest.rootMainFiles ?? []),
      ...routeNames,
    ]),
  );
}
const byPath = new Map(files.map((file) => [file.path.replace(/\\/g, "/"), file]));
const routeResults = [];
for (const route of config.routes) {
  const names = collectConfiguredRouteAssetNames(route.manifestKeys);
  if (names.length === 0) {
    errors.push(`Route budget ${route.name} did not match any supported route manifest key: ${route.manifestKeys.join(", ")}.`);
    continue;
  }
  const selected = names.map((name) => byPath.get(name.replace(/^\.?\//, ""))).filter(Boolean);
  const routeJs = summarizeBundleFiles(selected.filter((file) => extname(file.path) === ".js"));
  const routeCss = summarizeBundleFiles(selected.filter((file) => extname(file.path) === ".css"));
  errors.push(...evaluateSummary(routeJs, route.javascript, `${route.name} JavaScript`));
  errors.push(...evaluateSummary(routeCss, route.css, `${route.name} CSS`));
  routeResults.push({ name: route.name, javascript: routeJs, css: routeCss });
}

const printable = (summary) => ({
  files: summary.files,
  bytes: summary.bytes,
  gzipBytes: summary.gzipBytes,
  largest: summary.largest ? { file: summary.largest.path, bytes: summary.largest.bytes } : null,
  largestGzip: summary.largestGzip ? { file: summary.largestGzip.path, gzipBytes: summary.largestGzip.gzipBytes } : null,
});
console.log(JSON.stringify({
  global: { javascript: printable(jsSummary), css: printable(cssSummary) },
  routes: routeResults.map((route) => ({ name: route.name, javascript: printable(route.javascript), css: printable(route.css) })),
}, null, 2));

if (errors.length) {
  console.error("Bundle budget failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Bundle output is within the global, compressed, and route-specific production budgets.");
