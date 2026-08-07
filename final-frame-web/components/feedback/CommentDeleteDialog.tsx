"use client";

import { useState } from "react";
import Dialog from "@/components/ui/Dialog";
import InlineAlert from "@/components/ui/InlineAlert";
import { deleteComment } from "@/lib/api/comments";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { invalidateCommentAudioUrl } from "@/lib/storage/signed-url-cache";
import type { ProjectComment } from "@/lib/api/types";

interface CommentDeleteDialogProps {
  open: boolean;
  projectId: string;
  comment: ProjectComment | null;
  onClose: () => void;
  onDeleted: (comment: ProjectComment) => void;
}

export default function CommentDeleteDialog({ open, projectId, comment, onClose, onDeleted }: CommentDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  async function confirmDelete() {
    if (!comment || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteComment(projectId, comment.assetId, comment.id);
      invalidateCommentAudioUrl(projectId, comment.assetId, comment.id);
      onDeleted(comment);
      onClose();
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setError({
        message: getUserFacingErrorMessage(caught, "The feedback could not be deleted."),
        requestId: normalized.requestId,
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { if (!isDeleting) { setError(null); onClose(); } }}
      title="Delete feedback?"
      description="This permanently removes the feedback. Any attached voice note will be queued for secure storage cleanup."
      role="alertdialog"
      busy={isDeleting}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={isDeleting} className="min-h-11 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void confirmDelete()} disabled={isDeleting || !comment} className="min-h-11 rounded-xl bg-rose-400 px-5 text-sm font-bold text-rose-950 hover:bg-rose-300 disabled:opacity-50">{isDeleting ? "Deleting…" : "Delete feedback"}</button>
        </>
      )}
    >
      {comment?.text ? <blockquote className="line-clamp-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-300">{comment.text}</blockquote> : <p className="text-sm text-zinc-400">This feedback contains a voice note without written text.</p>}
      {error ? <InlineAlert tone="error" title="Feedback was not deleted" requestId={error.requestId} className="mt-4">{error.message}</InlineAlert> : null}
    </Dialog>
  );
}
