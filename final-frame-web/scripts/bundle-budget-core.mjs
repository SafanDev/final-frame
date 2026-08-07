import { gzipSync } from "node:zlib";

export function summarizeBundleFiles(files) {
  const items = files.map((file) => ({
    ...file,
    gzipBytes: file.gzipBytes ?? gzipSync(file.content ?? Buffer.alloc(file.bytes ?? 0)).byteLength,
    bytes: file.bytes ?? Buffer.byteLength(file.content ?? ""),
  }));
  const total = (key) => items.reduce((sum, item) => sum + item[key], 0);
  const largest = (key) => items.reduce((best, item) => item[key] > (best?.[key] ?? -1) ? item : best, null);
  return {
    files: items.length,
    bytes: total("bytes"),
    gzipBytes: total("gzipBytes"),
    largest: largest("bytes"),
    largestGzip: largest("gzipBytes"),
  };
}

export function evaluateSummary(summary, budget, label) {
  const errors = [];
  const checks = [
    ["bytes", "maxBytes", "raw bytes"],
    ["gzipBytes", "maxGzipBytes", "compressed bytes"],
    ["files", "maxFiles", "file count"],
  ];
  for (const [summaryKey, budgetKey, description] of checks) {
    if (budget[budgetKey] !== undefined && summary[summaryKey] > budget[budgetKey]) {
      errors.push(`${label} ${description} ${summary[summaryKey]} exceeds ${budget[budgetKey]}.`);
    }
  }
  if (budget.maxLargestBytes !== undefined && (summary.largest?.bytes ?? 0) > budget.maxLargestBytes) {
    errors.push(`${label} largest file ${(summary.largest?.bytes ?? 0)} exceeds ${budget.maxLargestBytes}: ${summary.largest?.path ?? "unknown"}.`);
  }
  if (budget.maxLargestGzipBytes !== undefined && (summary.largestGzip?.gzipBytes ?? 0) > budget.maxLargestGzipBytes) {
    errors.push(`${label} largest compressed file ${(summary.largestGzip?.gzipBytes ?? 0)} exceeds ${budget.maxLargestGzipBytes}: ${summary.largestGzip?.path ?? "unknown"}.`);
  }
  return errors;
}

export function collectRouteAssetNames({ buildManifest, appBuildManifest, manifestKeys }) {
  const pageFiles = manifestKeys.flatMap((key) => appBuildManifest?.pages?.[key] ?? []);
  if (pageFiles.length === 0) return [];
  return Array.from(new Set([...(buildManifest?.rootMainFiles ?? []), ...pageFiles]));
}
export function extractClientReferenceAssetNames(source, manifestKey) {
  const assignment = `globalThis.__RSC_MANIFEST[${JSON.stringify(manifestKey)}] = `;
  const assignmentStart = source.indexOf(assignment);
  if (assignmentStart < 0) return [];

  const jsonStart = assignmentStart + assignment.length;
  const jsonEnd = source.lastIndexOf(";");
  if (jsonEnd <= jsonStart) return [];

  let manifest;
  try {
    manifest = JSON.parse(source.slice(jsonStart, jsonEnd).trim());
  } catch {
    return [];
  }

  const javascript = Object.values(manifest.entryJSFiles ?? {})
    .flatMap((files) => Array.isArray(files) ? files : [])
    .filter((file) => typeof file === "string");

  const css = Object.values(manifest.entryCSSFiles ?? {})
    .flatMap((entries) => Array.isArray(entries) ? entries : [])
    .map((entry) => typeof entry === "string" ? entry : entry?.path)
    .filter((file) => typeof file === "string");

  return Array.from(new Set([...javascript, ...css]));
}
