"use client";

import { useRef } from "react";
import Dialog from "@/components/ui/Dialog";
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
  onFailed: (comment: ProjectComment, error: { message: string; requestId: string | null }) => void;
}

export default function CommentDeleteDialog({
  open,
  projectId,
  comment,
  onClose,
  onDeleted,
  onFailed,
}: CommentDeleteDialogProps) {
  const deletingIdsRef = useRef(new Set<string>());

  function confirmDelete() {
    if (!comment || deletingIdsRef.current.has(comment.id)) return;
    const target = comment;
    deletingIdsRef.current.add(target.id);

    // The confirmation is the user's commit point. Remove the row immediately
    // and let the server mutation settle in the background. A failed request
    // restores the exact comment, so network latency never traps the user in a
    // modal or leaves the list looking busy.
    onDeleted(target);
    onClose();

    void deleteComment(projectId, target.assetId, target.id)
      .then(() => {
        invalidateCommentAudioUrl(projectId, target.assetId, target.id);
      })
      .catch((caught) => {
        const normalized = normalizeApiError(caught);
        onFailed(target, {
          message: getUserFacingErrorMessage(caught, "The feedback could not be deleted."),
          requestId: normalized.requestId,
        });
      })
      .finally(() => {
        deletingIdsRef.current.delete(target.id);
      });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete feedback?"
      description="This permanently removes the feedback. Any attached voice note will be queued for secure storage cleanup."
      role="alertdialog"
      footer={(
        <>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-300 hover:bg-white/5">Cancel</button>
          <button type="button" onClick={confirmDelete} disabled={!comment} className="min-h-11 rounded-xl bg-rose-400 px-5 text-sm font-bold text-rose-950 hover:bg-rose-300 disabled:opacity-50">Delete feedback</button>
        </>
      )}
    >
      {comment?.text
        ? <blockquote className="line-clamp-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-300">{comment.text}</blockquote>
        : <p className="text-sm text-zinc-400">This feedback contains a voice note without written text.</p>}
    </Dialog>
  );
}
