"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { getAssetCategory } from "@/lib/assets/file-policy";
import type { ProjectAsset } from "@/lib/api/types";
import type { LocalUploadPreview as LocalUploadPreviewState } from "@/contexts/WorkspaceContext";

const PdfEngine = dynamic(() => import("@/components/PdfEngine"), {
  ssr: false,
  loading: () => <div role="status" className="ff-workspace-viewer-loading">Opening local PDF…</div>,
});

const CodeViewer = dynamic(() => import("@/components/viewers/CodeViewer"), {
  ssr: false,
  loading: () => <div role="status" className="ff-workspace-viewer-loading">Opening local source…</div>,
});

const MAX_LOCAL_CODE_BYTES = 2 * 1024 * 1024;

interface LocalUploadPreviewProps {
  preview: LocalUploadPreviewState;
  projectId: string;
}

export default function LocalUploadPreview({ preview, projectId }: LocalUploadPreviewProps) {
  const category = getAssetCategory(preview);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [localReadError, setLocalReadError] = useState("");

  const localAsset = useMemo<ProjectAsset>(() => {
    const now = new Date().toISOString();
    return {
      id: `local-${preview.token}`,
      projectId,
      fileName: preview.fileName,
      normalizedName: preview.fileName.toLowerCase(),
      stackKey: `local-${preview.token}`,
      mimeType: preview.mimeType,
      fileSize: preview.fileSize,
      previewMimeType: preview.mimeType,
      previewFileSize: preview.fileSize,
      width: null,
      height: null,
      durationSeconds: null,
      processingStatus: "PENDING",
      processingError: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      comments: [],
    };
  }, [preview.fileName, preview.fileSize, preview.mimeType, preview.token, projectId]);

  useEffect(() => {
    let cancelled = false;
    setPdfData(null);
    setSourceText(null);
    setLocalReadError("");

    if (category === "document") {
      void preview.file.arrayBuffer()
        .then((buffer) => {
          if (!cancelled) setPdfData(new Uint8Array(buffer));
        })
        .catch(() => {
          if (!cancelled) setLocalReadError("The local PDF could not be read. The secure review copy is still being prepared.");
        });
    } else if (category === "code" && preview.fileSize <= MAX_LOCAL_CODE_BYTES) {
      void preview.file.text()
        .then((text) => {
          if (!cancelled) setSourceText(text);
        })
        .catch(() => {
          if (!cancelled) setLocalReadError("The local source file could not be read. The secure review copy is still being prepared.");
        });
    }

    return () => {
      cancelled = true;
    };
  }, [category, preview.file, preview.fileSize, preview.token]);

  if (category === "image" && preview.objectUrl) {
    // The blob URL never leaves this browser and is revoked as soon as the verified preview is ready.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={preview.objectUrl} alt={`Local preview of ${preview.fileName}`} className="ff-workspace-image-preview" />;
  }

  if (category === "video" && preview.objectUrl) {
    return (
      <video
        src={preview.objectUrl}
        controls
        playsInline
        preload="metadata"
        className="ff-workspace-video-preview"
        aria-label={`Local video preview of ${preview.fileName}`}
      >
        The browser does not support video playback.
      </video>
    );
  }

  if (localReadError) {
    return (
      <div className="ff-workspace-viewer-unavailable" role="status">
        <strong>Local preview unavailable</strong>
        <p>{localReadError}</p>
      </div>
    );
  }

  if (category === "document") {
    if (!pdfData) return <div role="status" className="ff-workspace-viewer-loading">Opening local PDF…</div>;
    return <PdfEngine fileData={pdfData} fileName={preview.fileName} withCredentials={false} />;
  }

  if (category === "code") {
    if (preview.fileSize <= MAX_LOCAL_CODE_BYTES && sourceText === null) {
      return <div role="status" className="ff-workspace-viewer-loading">Opening local source…</div>;
    }
    return (
      <CodeViewer
        asset={localAsset}
        sourceText={sourceText ?? ""}
        credentials="omit"
      />
    );
  }

  return (
    <div className="ff-workspace-viewer-unavailable">
      <strong>Local preview unavailable</strong>
      <p>The secure review copy will appear when preparation finishes.</p>
    </div>
  );
}
