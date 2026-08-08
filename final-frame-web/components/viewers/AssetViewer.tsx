"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type RefObject } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import type { ProjectAsset } from "@/lib/api/types";
import { getAssetCategory } from "@/lib/assets/file-policy";

const PdfEngine = dynamic(() => import("@/components/PdfEngine"), {
  ssr: false,
  loading: () => <div role="status" className="ff-workspace-viewer-loading">Loading PDF…</div>,
});

const CodeViewer = dynamic(() => import("@/components/viewers/CodeViewer"), {
  ssr: false,
  loading: () => <div role="status" className="ff-workspace-viewer-loading">Loading source…</div>,
});

interface AssetViewerProps {
  asset: ProjectAsset;
  url: string;
  isLoading: boolean;
  error: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  onVideoTimeChange: (seconds: number) => void;
  onRefresh: () => Promise<string | null>;
  activeCommentId?: string | null;
  pendingLineRange?: { start: number; end: number } | null;
}

export default function AssetViewer({
  asset,
  url,
  isLoading,
  error,
  videoRef,
  onVideoTimeChange,
  onRefresh,
  activeCommentId = null,
  pendingLineRange = null,
}: AssetViewerProps) {
  const category = getAssetCategory(asset);
  const mediaRefreshAttemptedRef = useRef(false);

  useEffect(() => {
    mediaRefreshAttemptedRef.current = false;
  }, [asset.id]);

  function handleExpiringMediaError() {
    if (mediaRefreshAttemptedRef.current) return;
    mediaRefreshAttemptedRef.current = true;
    void onRefresh();
  }

  if (isLoading && !url) {
    return <div role="status" className="ff-workspace-viewer-loading">Opening preview…</div>;
  }

  if (error && !url) {
    return (
      <InlineAlert tone="error" title="Preview temporarily unavailable" className="max-w-xl">
        <p>{error}</p>
        <button type="button" onClick={() => void onRefresh()} className="mt-2 min-h-9 rounded-lg border border-current/25 px-3 text-sm font-bold hover:bg-white/5">Try again now</button>
      </InlineAlert>
    );
  }

  if (!url) return null;

  if (category === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`Preview of ${asset.fileName}, version ${asset.version}`}
        className="ff-workspace-image-preview"
        onError={handleExpiringMediaError}
      />
    );
  }

  if (category === "video") {
    return (
      <video
        ref={videoRef}
        src={url}
        crossOrigin="use-credentials"
        controls
        playsInline
        preload="metadata"
        className="ff-workspace-video-preview"
        onTimeUpdate={() => onVideoTimeChange(videoRef.current?.currentTime ?? 0)}
        onError={handleExpiringMediaError}
        aria-label={`Video preview of ${asset.fileName}, version ${asset.version}`}
      >
        The browser does not support video playback.
      </video>
    );
  }

  if (category === "document") {
    return <PdfEngine fileUrl={url} fileName={asset.fileName} onError={() => void onRefresh()} />;
  }

  if (category === "code") {
    return <CodeViewer asset={asset} url={url} onExpired={onRefresh} activeCommentId={activeCommentId} pendingLineRange={pendingLineRange} />;
  }

  return (
    <div className="ff-workspace-viewer-unavailable">
      <strong>Preview unavailable</strong>
      <p>Use the download option for this file.</p>
    </div>
  );
}
