"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { downloadApiArtifact } from '@/lib/api/download';
import { apiRoutes } from '@/lib/api/routes';

interface AssetDownloadButtonProps {
  assetId: string;
  fileName: string;
  compact?: boolean;
}

export default function AssetDownloadButton({ assetId, fileName, compact = false }: AssetDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    if (isDownloading) return;
    setIsDownloading(true);
    const toastId = toast.loading(`Authorizing ${fileName}…`);
    try {
      await downloadApiArtifact(apiRoutes.media.asset(assetId, 'download'), {
        fallbackFileName: fileName,
      });
      toast.success("Secure download started.", { id: toastId });
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      const suffix = normalized.requestId ? ` Reference: ${normalized.requestId}` : "";
      toast.error(`${getUserFacingErrorMessage(caught, "The download could not be started.")}${suffix}`, { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <button type="button" onClick={handleDownload} disabled={isDownloading} aria-label={`Download ${fileName}`} className={compact ? "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50" : "inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-50"}>
      {isDownloading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4" /></svg>{compact ? null : <span className="ml-2">Download</span>}</>}
    </button>
  );
}
