"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import VoiceRecorderControl, { type VoiceRecordingValue } from "@/components/feedback/VoiceRecorderControl";
import { createComment } from "@/lib/api/comments";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { uploadVoiceNote, type UploadProgress } from "@/lib/api/uploads";
import type { ProjectComment } from "@/lib/api/types";
import { resolveFeedbackAnchor } from "@/lib/feedback/anchor-core";
import { shouldSubmitFeedbackOnKeyDown } from "@/lib/feedback/keyboard";
import { composeFeedbackText } from "@/lib/feedback/transcript";

interface CommentLocation {
  x: number;
  y: number;
}

interface CommentComposerProps {
  projectId: string;
  assetId: string;
  location?: CommentLocation | null;
  pageNumber?: number | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  columnStart?: number | null;
  columnEnd?: number | null;
  timestamp?: number | null;
  disabled?: boolean;
  autoFocus?: boolean;
  title?: string;
  placeholder?: string;
  submitLabel?: string;
  compact?: boolean;
  onCreated: (comment: ProjectComment) => void;
  onCancel?: () => void;
}

type SubmissionStage = "idle" | "uploading-audio" | "saving-comment";

function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}


export default function CommentComposer({
  projectId,
  assetId,
  location = null,
  pageNumber = null,
  lineStart = null,
  lineEnd = null,
  columnStart = null,
  columnEnd = null,
  timestamp = null,
  disabled = false,
  autoFocus = false,
  title = "Add feedback",
  placeholder = "Describe the change clearly and include the expected result…",
  submitLabel = "Post feedback",
  compact = false,
  onCreated,
  onCancel,
}: CommentComposerProps) {
  const controllerRef = useRef<AbortController | null>(null);
  const voiceResetRef = useRef<() => void>(() => undefined);
  const [text, setText] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [transcriptionSupported, setTranscriptionSupported] = useState(false);
  const [stage, setStage] = useState<SubmissionStage>("idle");
  const [audioProgress, setAudioProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  const handleVoiceChange = useCallback((value: VoiceRecordingValue) => {
    setAudioBlob(value.blob);
    setVoiceTranscript(value.transcript);
    setTranscriptionSupported(value.transcriptionSupported);
    voiceResetRef.current = value.reset;
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const isSubmitting = stage !== "idle";
  const finalText = composeFeedbackText(text, voiceTranscript, Boolean(audioBlob));
  const exceedsTextLimit = finalText.length > 5_000;
  const canSubmit = !disabled && !isSubmitting && !exceedsTextLimit && (finalText.length > 0 || Boolean(audioBlob));
  const hasAnchor = Boolean(location || timestamp !== null || pageNumber !== null || lineStart !== null);
  const anchorDescription = timestamp !== null
    ? `Video ${formatTimestamp(timestamp)}`
    : pageNumber !== null
      ? `PDF page ${pageNumber}`
      : lineStart !== null
        ? `Source line${lineEnd !== null && lineEnd !== lineStart ? `s ${lineStart}–${lineEnd}` : ` ${lineStart}`}`
        : location
          ? "Pinned to file"
          : "General feedback";

  function resetComposer() {
    setText("");
    setAudioBlob(null);
    setVoiceTranscript("");
    setAudioProgress(null);
    setError(null);
    voiceResetRef.current();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);

    try {
      let audioKey: string | null = null;
      if (audioBlob) {
        setStage("uploading-audio");
        audioKey = await uploadVoiceNote(projectId, audioBlob, {
          signal: controller.signal,
          onProgress: setAudioProgress,
        });
      }

      setStage("saving-comment");
      const anchor = resolveFeedbackAnchor({
        location,
        pageNumber,
        lineStart,
        lineEnd,
        columnStart,
        columnEnd,
        timestamp,
      });
      const comment = await createComment(projectId, assetId, {
        text: finalText,
        ...anchor,
        audioKey,
      }, controller.signal);

      onCreated(comment);
      resetComposer();
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (normalized.kind !== "aborted") {
        setError({
          message: getUserFacingErrorMessage(caught, "The feedback could not be saved."),
          requestId: normalized.requestId,
        });
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setStage("idle");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const shouldSubmit = shouldSubmitFeedbackOnKeyDown({
      key: event.key,
      isComposing: event.nativeEvent.isComposing,
      isPinned: hasAnchor,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
    if (!shouldSubmit || !canSubmit) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className={`rounded-2xl border border-white/10 bg-[#101113] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {hasAnchor ? (
            <p className="mt-1 text-xs leading-5 text-zinc-500">{anchorDescription}</p>
          ) : null}
        </div>
        <span className={`text-xs tabular-nums ${exceedsTextLimit ? "font-bold text-rose-300" : "text-zinc-600"}`}>{finalText.length}/5000</span>
      </div>

      <label htmlFor={`comment-${assetId}-${hasAnchor ? "anchor" : "general"}`} className="sr-only">Feedback text</label>
      <textarea
        id={`comment-${assetId}-${hasAnchor ? "anchor" : "general"}`}
        value={text}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={5_000}
        rows={compact ? 2 : hasAnchor ? 3 : 4}
        autoFocus={autoFocus}
        disabled={disabled || isSubmitting}
        placeholder={placeholder}
        className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
      />

      <div className="mt-3">
        <VoiceRecorderControl disabled={disabled || isSubmitting} onChange={handleVoiceChange} />
      </div>

      {audioBlob ? (
        <div className="mt-3">
          <label htmlFor={`transcript-${assetId}-${hasAnchor ? "anchor" : "general"}`} className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
            Voice transcript{transcriptionSupported ? " · editable" : " · type manually"}
          </label>
          <textarea
            id={`transcript-${assetId}-${hasAnchor ? "anchor" : "general"}`}
            value={voiceTranscript}
            onChange={(event) => setVoiceTranscript(event.target.value)}
            rows={3}
            maxLength={4_000}
            placeholder="Add or correct the transcript so the voice note is searchable and accessible."
            disabled={isSubmitting}
            className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-6 text-zinc-200 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-60"
          />
        </div>
      ) : null}

      {exceedsTextLimit ? <InlineAlert tone="warning" title="Feedback is too long" className="mt-3">Shorten the written note or transcript to stay within 5,000 characters.</InlineAlert> : null}

      {stage === "uploading-audio" ? (
        <div role="status" className="mt-3 rounded-xl border border-sky-400/20 bg-sky-500/10 p-3 text-sm text-sky-100">
          Uploading voice note{audioProgress ? ` · ${audioProgress.percentage}%` : "…"}
          {audioProgress ? <progress value={audioProgress.percentage} max={100} className="mt-2 block h-1.5 w-full accent-sky-400" aria-label="Voice-note upload progress" /> : null}
        </div>
      ) : null}
      {stage === "saving-comment" ? <p role="status" className="mt-3 text-sm text-zinc-400">Saving feedback…</p> : null}
      {error ? <InlineAlert tone="error" title="Feedback was not saved" requestId={error.requestId} className="mt-3">{error.message}</InlineAlert> : null}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-zinc-600">{location ? "Enter saves · Shift + Enter adds a line" : "Ctrl or Command + Enter to post"}</p>
        <div className="flex gap-2 sm:justify-end">
          {onCancel ? (
            <button type="button" onClick={onCancel} disabled={isSubmitting} className="min-h-10 flex-1 rounded-lg border border-white/10 px-4 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50 sm:flex-none">Cancel</button>
          ) : null}
          <button type="submit" disabled={!canSubmit} className="min-h-10 flex-1 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none">
            {isSubmitting ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
