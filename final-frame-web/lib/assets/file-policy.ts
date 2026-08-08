import type { ProjectAsset } from "@/lib/api/types";

export const MAX_ASSET_UPLOAD_BYTES = 100 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  c: "text/x-c",
  cpp: "text/x-c++src",
  cs: "text/x-csharp",
  css: "text/css",
  csv: "text/csv",
  go: "text/x-go",
  java: "text/x-java-source",
  js: "application/javascript",
  json: "application/json",
  jsx: "application/javascript",
  md: "text/markdown",
  mov: "video/quicktime",
  mp4: "video/mp4",
  pdf: "application/pdf",
  php: "text/x-php",
  py: "text/x-python",
  rb: "text/x-ruby",
  rs: "text/x-rust",
  sh: "text/x-shellscript",
  sql: "text/x-sql",
  ts: "application/typescript",
  tsx: "application/typescript",
  txt: "text/plain",
  webm: "video/webm",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
});

const ALLOWED_MIME_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/pdf",
  "application/typescript",
  "application/xml",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/css",
  "text/csv",
  "text/javascript",
  "text/markdown",
  "text/plain",
  "text/typescript",
  "text/x-c",
  "text/x-c++src",
  "text/x-csharp",
  "text/x-go",
  "text/x-java-source",
  "text/x-php",
  "text/x-python",
  "text/x-ruby",
  "text/x-rust",
  "text/x-shellscript",
  "text/x-sql",
  "text/yaml",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const ASSET_FILE_ACCEPT = [
  ".c", ".cpp", ".cs", ".css", ".csv", ".gif", ".go", ".java", ".jpeg", ".jpg",
  ".js", ".json", ".jsx", ".md", ".mov", ".mp4", ".pdf", ".php", ".png", ".py",
  ".rb", ".rs", ".sh", ".sql", ".ts", ".tsx", ".txt", ".webm", ".webp", ".xml",
  ".yaml", ".yml",
].join(",");

export type AssetCategory = "image" | "video" | "document" | "code" | "other";

export interface FileValidationResult {
  valid: boolean;
  message: string | null;
}

function extensionOf(fileName: string): string {
  const cleanName = fileName.split(/[?#]/, 1)[0] ?? fileName;
  return cleanName.includes(".") ? cleanName.split(".").pop()?.toLowerCase() ?? "" : "";
}

function normalizeMimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function getAssetUploadMimeType(file: Pick<File, "name" | "type">): string | null {
  const browserType = normalizeMimeType(file.type);
  if (ALLOWED_MIME_TYPES.has(browserType)) return browserType;
  return MIME_BY_EXTENSION[extensionOf(file.name)] ?? null;
}

export function normalizeAssetFileName(fileName: string): string {
  return fileName
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function validateAssetFile(file: File): FileValidationResult {
  if (file.size <= 0) return { valid: false, message: "The selected file is empty." };
  if (file.size > MAX_ASSET_UPLOAD_BYTES) {
    return { valid: false, message: "The selected file exceeds the 100 MB upload limit." };
  }
  if (!getAssetUploadMimeType(file)) {
    return {
      valid: false,
      message: "Use a supported image, video, PDF, data, or source-code file. HTML, SVG, executables, and archives are not accepted.",
    };
  }
  if (!normalizeAssetFileName(file.name)) return { valid: false, message: "The file name is not valid." };
  return { valid: true, message: null };
}

export function getAssetCategory(asset: Pick<ProjectAsset, "mimeType" | "fileName">): AssetCategory {
  const mimeType = normalizeMimeType(asset.mimeType);
  const extension = extensionOf(asset.fileName);
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "document";
  if (
    mimeType.startsWith("text/")
    || ["application/json", "application/javascript", "application/typescript", "application/xml"].includes(mimeType)
    || [
      "c", "cpp", "cs", "css", "csv", "go", "java", "js", "json", "jsx", "md", "php",
      "py", "rb", "rs", "sh", "sql", "ts", "tsx", "txt", "xml", "yaml", "yml",
    ].includes(extension)
  ) return "code";
  return "other";
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
