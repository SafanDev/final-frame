import { describe, expect, it } from "vitest";
import {
  MAX_ASSET_UPLOAD_BYTES,
  formatFileSize,
  getAssetCategory,
  normalizeAssetFileName,
  validateAssetFile,
} from "@/lib/assets/file-policy";

describe("asset file policy", () => {
  it("normalizes unsafe and excessive file names", () => {
    expect(normalizeAssetFileName('  report:final?.pdf  ')).toBe("report-final-.pdf");
    expect(normalizeAssetFileName("a".repeat(300))).toHaveLength(180);
  });

  it("rejects empty and oversized files", () => {
    expect(validateAssetFile(new File([], "empty.pdf", { type: "application/pdf" }))).toEqual({
      valid: false,
      message: "The selected file is empty.",
    });
    const oversized = new File([new Uint8Array(1)], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: MAX_ASSET_UPLOAD_BYTES + 1 });
    expect(validateAssetFile(oversized).valid).toBe(false);
  });

  it("accepts supported files and rejects unknown executable formats", () => {
    expect(validateAssetFile(new File(["hello"], "notes.md", { type: "text/markdown" })).valid).toBe(true);
    expect(validateAssetFile(new File(["const App = () => null"], "App.tsx", { type: "" })).valid).toBe(true);
    expect(validateAssetFile(new File(["name: FinalFrame"], "project.yaml", { type: "application/octet-stream" })).valid).toBe(true);
    expect(validateAssetFile(new File(["<script>alert(1)</script>"], "page.html", { type: "text/html" })).valid).toBe(false);
    expect(validateAssetFile(new File(["<svg/>"], "mark.svg", { type: "image/svg+xml" })).valid).toBe(false);
    expect(validateAssetFile(new File(["x"], "payload.exe", { type: "application/x-msdownload" })).valid).toBe(false);
  });

  it("categorizes assets by MIME type and extension", () => {
    expect(getAssetCategory({ mimeType: "image/png", fileName: "frame.png" })).toBe("image");
    expect(getAssetCategory({ mimeType: "video/mp4", fileName: "review.mp4" })).toBe("video");
    expect(getAssetCategory({ mimeType: "application/pdf", fileName: "brief.pdf" })).toBe("document");
    expect(getAssetCategory({ mimeType: "application/octet-stream", fileName: "component.tsx" })).toBe("code");
    expect(getAssetCategory({ mimeType: "application/zip", fileName: "archive.zip" })).toBe("other");
  });

  it("formats file sizes for users", () => {
    expect(formatFileSize(-1)).toBe("Unknown size");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1_536)).toBe("1.5 KB");
    expect(formatFileSize(12 * 1024 * 1024)).toBe("12 MB");
  });
});
