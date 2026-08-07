"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Dialog from "@/components/ui/Dialog";
import InlineAlert from "@/components/ui/InlineAlert";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { renameAssetStack } from "@/lib/api/assets";
import { normalizeAssetFileName } from "@/lib/assets/file-policy";
import type { ProjectAsset } from "@/lib/api/types";

interface AssetRenameDialogProps {
  open: boolean;
  projectId: string;
  asset: ProjectAsset | null;
  expectedVersion: number;
  onClose: () => void;
  onRenamed: (fileName: string) => Promise<void> | void;
}

export default function AssetRenameDialog({ open, projectId, asset, expectedVersion, onClose, onRenamed }: AssetRenameDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFileName(asset?.fileName ?? "");
      setError(null);
      setRequestId(null);
    }
  }, [asset?.fileName, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset || isSaving) return;
    const normalized = normalizeAssetFileName(fileName);
    if (!normalized) {
      setError("Enter a valid file name.");
      return;
    }
    if (normalized === asset.fileName) {
      onClose();
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const result = await renameAssetStack(projectId, asset.id, normalized, expectedVersion);
      await onRenamed(result.fileName);
      onClose();
    } catch (caught) {
      const normalizedError = normalizeApiError(caught);
      setRequestId(normalizedError.requestId);
      setError(getUserFacingErrorMessage(caught, "The file could not be renamed."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Rename file stack" description="The new name is applied to every version in this stack." busy={isSaving} initialFocusRef={inputRef} footer={<><button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 rounded-lg border border-white/10 px-5 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50">Cancel</button><button type="submit" form="asset-rename-form" disabled={isSaving || !fileName.trim()} className="min-h-11 rounded-lg bg-emerald-400 px-5 text-sm font-bold text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Renaming…" : "Rename stack"}</button></>}>
      <form id="asset-rename-form" onSubmit={handleSubmit}>
        {error ? <InlineAlert tone="error" title="Rename failed" requestId={requestId}>{error}</InlineAlert> : null}
        <label htmlFor="asset-file-name" className="mt-5 block text-sm font-semibold text-zinc-200">File name</label>
        <input ref={inputRef} id="asset-file-name" value={fileName} onChange={(event) => setFileName(event.target.value)} maxLength={255} autoComplete="off" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25" />
        <p className="mt-2 text-xs text-zinc-500">Reserved filename characters are replaced automatically.</p>
      </form>
    </Dialog>
  );
}
