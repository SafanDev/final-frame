"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type RefObject } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import type { ProjectAsset } from "@/lib/api/types";
import { getAssetCategory } from "@/lib/assets/file-policy";

const PdfEngine = dynamic(() => import("@/components/PdfEngine"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="w-[min(62rem,90vw)] rounded-2xl border border-white/10 bg-[#080808] p-12 text-center text-sm text-zinc-400"
    >
      Loading PDF viewer…
    </div>
  ),
});

const CodeViewer = dynamic(() => import("@/components/viewers/CodeViewer"), {
  ssr: false,
  loading: () => <div role="status" className="w-[min(72rem,90vw)] rounded-2xl border border-white/10 bg-[#080808] p-12 text-center text-sm text-zinc-400">Loading source viewer…</div>,
});

interface AssetViewerProps {
  asset: ProjectAsset;
  url: string;
  isLoading: boolean;
  error: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  onVideoTimeChange: (seconds: number) => void;
  onRefresh: () => Promise<string | null>;
}

export default function AssetViewer({
  asset,
  url,
  isLoading,
  error,
  videoRef,
  onVideoTimeChange,
  onRefresh,
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
    return <div role="status" className="rounded-2xl border border-white/10 bg-[#080808] px-12 py-16 text-center text-sm text-zinc-400">Preparing secure preview…</div>;
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
        className="block max-h-[78vh] max-w-[90vw] rounded-lg border border-white/10 bg-black object-contain"
        onError={handleExpiringMediaError}
      />
    );
  }

  if (category === "video") {
    return (
      <video
        ref={videoRef}
        src={url}
        controls
        playsInline
        preload="metadata"
        className="block max-h-[78vh] max-w-[90vw] rounded-lg border border-white/10 bg-black"
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
    return <CodeViewer asset={asset} url={url} onExpired={onRefresh} />;
  }

  return (
    <div className="w-[min(38rem,90vw)] rounded-xl border border-white/10 bg-[#101113] p-8 text-center">
      <p className="font-bold text-white">Preview is not available for this file type</p>
      <p className="mt-2 text-sm leading-6 text-zinc-500">Use the authorised download control in the workspace header or file panel.</p>
    </div>
  );
}
