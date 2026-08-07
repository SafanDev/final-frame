export interface BundleFileInput {
  path: string;
  content?: string | Uint8Array;
  bytes?: number;
  gzipBytes?: number;
}

export interface BundleFileResult extends BundleFileInput {
  bytes: number;
  gzipBytes: number;
}

export interface BundleSummary {
  files: number;
  bytes: number;
  gzipBytes: number;
  largest: BundleFileResult | null;
  largestGzip: BundleFileResult | null;
}

export interface BundleBudget {
  maxBytes?: number;
  maxGzipBytes?: number;
  maxFiles?: number;
  maxLargestBytes?: number;
  maxLargestGzipBytes?: number;
}

export function summarizeBundleFiles(
  files: readonly BundleFileInput[],
): BundleSummary;

export function evaluateSummary(
  summary: BundleSummary,
  budget: BundleBudget,
  label: string,
): string[];

export function collectRouteAssetNames(input: {
  buildManifest?: {
    rootMainFiles?: readonly string[];
  } | null;
  appBuildManifest?: {
    pages?: Record<string, readonly string[] | undefined>;
  } | null;
  manifestKeys: readonly string[];
}): string[];
export function extractClientReferenceAssetNames(
  source: string,
  manifestKey: string,
): string[];