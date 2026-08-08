"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import VoiceNotePlayer from "@/components/feedback/VoiceNotePlayer";
import InlineAlert from "@/components/ui/InlineAlert";
import WorkspaceIcon from "@/components/workspace/WorkspaceIcon";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { setCommentResolved, updateComment } from "@/lib/api/comments";
import type { ProjectComment } from "@/lib/api/types";
import { composeFeedbackText, splitFeedbackText } from "@/lib/feedback/transcript";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { formatDateTime } from "@/lib/utils/format";

interface CommentCardProps {
  projectId: string;
  ownerId: string;
  currentUserId: string | null;
  comment: ProjectComment;
  isLocked: boolean;
  isActive: boolean;
  onActivate: (comment: ProjectComment) => void;
  onUpdated: (comment: ProjectComment) => void;
  onResolved: (assetId: string, commentId: string, isResolved: boolean) => void;
  onRequestDelete: (comment: ProjectComment) => void;
}


function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, audio"));
}

function formatVideoTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export default function CommentCard({
  projectId,
  ownerId,
  currentUserId,
  comment,
  isLocked,
  isActive,
  onActivate,
  onUpdated,
  onResolved,
  onRequestDelete,
}: CommentCardProps) {
  const preferences = useUserPreferences();
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(() => splitFeedbackText(comment.text).note);
  const [isSaving, setIsSaving] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  const isOwner = currentUserId === ownerId;
  const isAuthor = currentUserId === comment.authorId;
  const isDesignerComment = comment.authorId === ownerId;
  const canDelete = !isLocked && isAuthor;
  const hasLocation = comment.xPos !== null && comment.yPos !== null;
  const hasAnchor = comment.anchorType !== "GENERAL";
  const anchorLabel = comment.timestamp !== null
    ? `video ${formatVideoTime(comment.timestamp)}`
    : comment.pageNumber !== null
      ? `PDF page ${comment.pageNumber}`
      : comment.lineStart !== null
        ? `source line${comment.lineEnd !== null && comment.lineEnd !== comment.lineStart ? `s ${comment.lineStart}–${comment.lineEnd}` : ` ${comment.lineStart}`}`
        : hasLocation
          ? "pinned"
          : "general";
  const displayText = splitFeedbackText(comment.text);
  const editedText = composeFeedbackText(editText, displayText.transcript, comment.hasAudio);
  const maxEditNoteLength = Math.max(0, 5_000 - (displayText.transcript ? displayText.transcript.length + "\n\nTranscript:\n".length : 0));

  useEffect(() => {
    setEditText(splitFeedbackText(comment.text).note);
  }, [comment.text]);

  useEffect(() => {
    if (isEditing) editInputRef.current?.focus();
  }, [isEditing]);

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextText = editedText;
    if (isSaving || nextText === comment.text || (!nextText && !comment.hasAudio)) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateComment(projectId, comment.assetId, comment.id, nextText);
      onUpdated(updated);
      setIsEditing(false);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setError({
        message: getUserFacingErrorMessage(caught, "The feedback could not be updated."),
        requestId: normalized.requestId,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleResolved() {
    if (!isOwner || isLocked || isResolving) return;
    setIsResolving(true);
    setError(null);
    const next = !comment.isResolved;
    try {
      await setCommentResolved(projectId, comment.assetId, comment.id, next);
      onResolved(comment.assetId, comment.id, next);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setError({
        message: getUserFacingErrorMessage(caught, "The feedback status could not be changed."),
        requestId: normalized.requestId,
      });
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <article
      id={`comment-${comment.id}`}
      data-feedback-selection={comment.id}
      onClick={(event) => { if (hasAnchor && !isInteractiveTarget(event.target)) onActivate(comment); }}
      className={`ff-workspace-comment-card ${isActive ? "is-active" : ""} ${hasAnchor ? "is-anchored" : ""}`}
    >
      <div className="ff-workspace-comment-head">
        <button
          type="button"
          onClick={() => onActivate(comment)}
          aria-pressed={isActive}
          className={`ff-workspace-comment-avatar ${isDesignerComment ? "is-designer" : "is-client"}`}
          aria-label={hasAnchor ? `Show ${comment.author?.name ?? "user"}'s anchored feedback` : `Select ${comment.author?.name ?? "user"}'s general feedback`}
        >
          {(comment.author?.name ?? "U").slice(0, 2).toUpperCase()}
        </button>

        <div className="ff-workspace-comment-copy">
          <div className="ff-workspace-comment-author-row">
            <p className="ff-workspace-comment-author">{comment.author?.name ?? "Former member"}</p>
            <span className={`ff-workspace-comment-role ${isDesignerComment ? "is-designer" : "is-client"}`}>{isDesignerComment ? "Designer" : "Client"}</span>
            {comment.isResolved ? <span className="ff-workspace-comment-resolved">Resolved</span> : null}
          </div>
          <p className="ff-workspace-comment-meta">
            <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt, preferences)}</time>
            {comment.editedAt !== null ? " · edited" : ""}
            {` · ${anchorLabel}`}
          </p>
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={saveEdit} className="mt-4">
          <label htmlFor={`edit-${comment.id}`} className="sr-only">Edit feedback</label>
          <textarea
            ref={editInputRef}
            id={`edit-${comment.id}`}
            value={editText}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEditText(event.target.value)}
            maxLength={maxEditNoteLength}
            rows={4}
            disabled={isSaving}
            className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => { setIsEditing(false); setEditText(splitFeedbackText(comment.text).note); setError(null); }} disabled={isSaving} className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSaving || editedText === comment.text || editedText.length > 5_000 || (!editText.trim() && !comment.hasAudio)} className="min-h-9 rounded-lg bg-emerald-400 px-3 text-xs font-bold text-zinc-950 hover:bg-emerald-300 disabled:opacity-45">{isSaving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      ) : (
        <>
          {comment.hasAudio ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Voice note</p>
              <VoiceNotePlayer projectId={projectId} assetId={comment.assetId} commentId={comment.id} initialUrl={comment.audioUrl} />
            </div>
          ) : null}
          {displayText.note ? <p className="ff-workspace-comment-body">{displayText.note}</p> : null}
          {displayText.transcript ? (
            <div className="mt-3 rounded-xl border border-sky-400/15 bg-sky-500/[0.06] p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-300">Transcript</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{displayText.transcript}</p>
            </div>
          ) : null}
          {!comment.hasAudio && !displayText.note && !displayText.transcript ? <p className="ff-workspace-comment-empty">No text supplied</p> : null}
        </>
      )}

      {error ? <InlineAlert tone="error" title="Feedback action failed" requestId={error.requestId} className="mt-3">{error.message}</InlineAlert> : null}

      {!isEditing && !isLocked && (isAuthor || isOwner) ? (
        <div className="ff-workspace-comment-actions">
          {isAuthor ? <button type="button" onClick={() => { setIsEditing(true); setError(null); }} className="ff-workspace-comment-action"><WorkspaceIcon name="edit" /><span>Edit</span></button> : null}
          {isOwner ? <button type="button" onClick={() => void toggleResolved()} disabled={isResolving} className="ff-workspace-comment-action"><WorkspaceIcon name={comment.isResolved ? "revision" : "approve"} /><span>{isResolving ? "Updating…" : comment.isResolved ? "Reopen" : "Resolve"}</span></button> : null}
          {canDelete ? <button type="button" onClick={() => onRequestDelete(comment)} className="ff-workspace-comment-action is-danger"><WorkspaceIcon name="trash" /><span>Delete</span></button> : null}
        </div>
      ) : null}
    </article>
  );
}
