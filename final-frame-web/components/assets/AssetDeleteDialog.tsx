"use client";

import { useEffect, useRef, useState } from "react";
import Dialog from "@/components/ui/Dialog";
import InlineAlert from "@/components/ui/InlineAlert";
import { deleteAsset } from "@/lib/api/assets";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { invalidateAssetUrl } from "@/lib/storage/signed-url-cache";
import type { DeleteAssetResponse, DeleteAssetScope, ProjectAsset } from "@/lib/api/types";

interface AssetDeleteDialogProps {
  open: boolean;
  projectId: string;
  asset: ProjectAsset | null;
  stackSize: number;
  expectedVersion: number;
  onClose: () => void;
  onDeleted: (scope: DeleteAssetScope, asset: ProjectAsset, result: DeleteAssetResponse) => Promise<void> | void;
}

export default function AssetDeleteDialog({ open, projectId, asset, stackSize, expectedVersion, onClose, onDeleted }: AssetDeleteDialogProps) {
  const versionRadioRef = useRef<HTMLInputElement | null>(null);
  const [scope, setScope] = useState<DeleteAssetScope>("version");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setScope("version");
      setError(null);
      setRequestId(null);
    }
  }, [open]);

  async function handleDelete() {
    if (!asset || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      const result = await deleteAsset(projectId, asset.id, scope, expectedVersion);
      invalidateAssetUrl(asset.id);
      await onDeleted(scope, asset, result);
      onClose();
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setRequestId(normalized.requestId);
      setError(getUserFacingErrorMessage(caught, "The file could not be deleted."));
    } finally {
      setIsDeleting(false);
    }
  }

  const scopeDescription = scope === "stack"
    ? `Delete all ${stackSize} version${stackSize === 1 ? "" : "s"}, every related comment, and associated voice notes.`
    : `Delete only version ${asset?.version ?? ""}. Other versions remain available.`;

  return (
    <Dialog open={open} onClose={onClose} title="Delete file" description="Choose exactly what should be removed. Storage cleanup runs safely after the database change." role="alertdialog" busy={isDeleting} initialFocusRef={versionRadioRef} footer={<><button type="button" onClick={onClose} disabled={isDeleting} className="min-h-11 rounded-lg border border-white/10 px-5 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50">Cancel</button><button type="button" onClick={handleDelete} disabled={isDeleting || !asset} className="min-h-11 rounded-lg bg-red-500 px-5 text-sm font-bold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50">{isDeleting ? "Deleting…" : scope === "stack" ? "Delete entire stack" : "Delete this version"}</button></>}>
      {error ? <InlineAlert tone="error" title="Deletion failed" requestId={requestId}>{error}</InlineAlert> : null}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-zinc-200">Deletion scope</legend>
        <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 p-4 transition has-[:checked]:border-emerald-400/60 has-[:checked]:bg-emerald-500/[0.06]">
          <input ref={versionRadioRef} type="radio" name="delete-scope" value="version" checked={scope === "version"} onChange={() => setScope("version")} className="mt-1 h-4 w-4 accent-emerald-400" />
          <span><span className="block text-sm font-semibold text-white">Version {asset?.version ?? ""} only</span><span className="mt-1 block text-xs leading-5 text-zinc-400">Keeps every other version in {asset?.fileName ?? "this stack"}.</span></span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-xl border border-red-500/20 p-4 transition has-[:checked]:border-red-400/60 has-[:checked]:bg-red-500/[0.06]">
          <input type="radio" name="delete-scope" value="stack" checked={scope === "stack"} onChange={() => setScope("stack")} className="mt-1 h-4 w-4 accent-red-400" />
          <span><span className="block text-sm font-semibold text-white">Entire file stack</span><span className="mt-1 block text-xs leading-5 text-zinc-400">Removes all {stackSize} version{stackSize === 1 ? "" : "s"} and related feedback.</span></span>
        </label>
      </fieldset>
      <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">{scopeDescription}</p>
    </Dialog>
  );
}
