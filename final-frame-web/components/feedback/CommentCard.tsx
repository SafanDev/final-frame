"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import VoiceNotePlayer from "@/components/feedback/VoiceNotePlayer";
import InlineAlert from "@/components/ui/InlineAlert";
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
      onClick={(event) => { if (hasAnchor && !isInteractiveTarget(event.target)) onActivate(comment); }}
      className={`rounded-xl border p-3 transition ${isActive ? "border-emerald-400/50 bg-emerald-500/[0.07]" : "border-white/10 bg-white/[0.02] hover:border-white/20"} ${hasAnchor ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onActivate(comment)}
          aria-pressed={isActive}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400 ${isDesignerComment ? "bg-sky-400 text-sky-950" : "bg-emerald-400 text-emerald-950"}`}
          aria-label={hasAnchor ? `Show ${comment.author?.name ?? "user"}'s anchored feedback` : `Select ${comment.author?.name ?? "user"}'s general feedback`}
        >
          {(comment.author?.name ?? "U").slice(0, 2).toUpperCase()}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-bold text-white">{comment.author?.name ?? "Former member"}</p>
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold uppercase tracking-[0.12em] ${isDesignerComment ? "bg-sky-500/10 text-sky-300" : "bg-emerald-500/10 text-emerald-300"}`}>{isDesignerComment ? "Designer" : "Client"}</span>
            {comment.isResolved ? <span className="rounded-md bg-zinc-700/50 px-1.5 py-0.5 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300">Resolved</span> : null}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
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
          {displayText.note ? <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{displayText.note}</p> : null}
          {displayText.transcript ? (
            <div className="mt-3 rounded-xl border border-sky-400/15 bg-sky-500/[0.06] p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-300">Transcript</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{displayText.transcript}</p>
            </div>
          ) : null}
          {!comment.hasAudio && !displayText.note && !displayText.transcript ? <p className="mt-4 text-sm italic text-zinc-500">No text supplied</p> : null}
        </>
      )}

      {error ? <InlineAlert tone="error" title="Feedback action failed" requestId={error.requestId} className="mt-3">{error.message}</InlineAlert> : null}

      {!isEditing && !isLocked && (isAuthor || isOwner) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          {isAuthor ? <button type="button" onClick={() => { setIsEditing(true); setError(null); }} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-white">Edit</button> : null}
          {isOwner ? <button type="button" onClick={() => void toggleResolved()} disabled={isResolving} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-50">{isResolving ? "Updating…" : comment.isResolved ? "Reopen" : "Resolve"}</button> : null}
          {canDelete ? <button type="button" onClick={() => onRequestDelete(comment)} className="ml-auto min-h-9 rounded-lg px-3 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">Delete</button> : null}
        </div>
      ) : null}
    </article>
  );
}
