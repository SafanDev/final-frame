"use client";

import type { UploadProgress, UploadStage } from "@/lib/api/uploads";

const stageLabel: Record<UploadStage, string> = {
  reserving: "Getting upload ready",
  transferring: "Uploading securely",
  completing: "Checking upload",
};

interface AssetUploadStatusProps {
  fileName: string;
  stage: UploadStage;
  progress: UploadProgress;
  queuedCount?: number;
  onCancel: () => void;
}

export default function AssetUploadStatus({ fileName, stage, progress, queuedCount = 0, onCancel }: AssetUploadStatusProps) {
  return (
    <section aria-live="polite" aria-label="File upload progress" className="ff-workspace-upload-status">
      <div className="ff-workspace-upload-status-head">
        <div className="min-w-0">
          <p title={fileName}>{fileName}</p>
          <span>{stageLabel[stage]}{queuedCount > 0 ? ` · ${queuedCount} more queued` : ""}</span>
        </div>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      <div className="ff-workspace-upload-track" aria-hidden="true">
        <div style={{ width: `${progress.percentage}%` }} />
      </div>
      <span className="ff-workspace-upload-percent">{progress.percentage}%</span>
    </section>
  );
}
