"use client";

import type { UploadProgress, UploadStage } from "@/lib/api/uploads";

const stageLabel: Record<UploadStage, string> = {
  reserving: "Preparing secure upload",
  transferring: "Uploading to encrypted storage",
  completing: "Verifying and saving file",
};

interface AssetUploadStatusProps {
  fileName: string;
  stage: UploadStage;
  progress: UploadProgress;
  onCancel: () => void;
}

export default function AssetUploadStatus({ fileName, stage, progress, onCancel }: AssetUploadStatusProps) {
  return (
    <section aria-live="polite" aria-label="File upload progress" className="border-t border-white/10 bg-emerald-500/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{fileName}</p>
          <p className="mt-1 text-xs text-zinc-400">{stageLabel[stage]}</p>
        </div>
        <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-300">
          Cancel
        </button>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-200" style={{ width: `${progress.percentage}%` }} />
      </div>
      <p className="mt-2 text-right text-xs font-semibold tabular-nums text-emerald-300">{progress.percentage}%</p>
    </section>
  );
}
