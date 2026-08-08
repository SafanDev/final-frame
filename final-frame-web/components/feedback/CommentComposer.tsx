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
  onSubmitStart?: () => void;
  onSubmitError?: () => void;
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
  placeholder = "What should change?",
  submitLabel = "Post",
  compact = false,
  onCreated,
  onSubmitStart,
  onSubmitError,
  onCancel,
}: CommentComposerProps) {
  const controllerRef = useRef<AbortController | null>(null);
  const voiceResetRef = useRef<() => void>(() => undefined);
  const [text, setText] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [stage, setStage] = useState<SubmissionStage>("idle");
  const [audioProgress, setAudioProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  const handleVoiceChange = useCallback((value: VoiceRecordingValue) => {
    setAudioBlob(value.blob);
    voiceResetRef.current = value.reset;
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const isSubmitting = stage !== "idle";
  const finalText = composeFeedbackText(text, "", Boolean(audioBlob));
  const exceedsTextLimit = finalText.length > 5_000;
  const showCharacterCount = finalText.length >= 4_500 || exceedsTextLimit;
  const canSubmit = !disabled && !isSubmitting && !exceedsTextLimit && (finalText.length > 0 || Boolean(audioBlob));
  const hasAnchor = Boolean(location || timestamp !== null || pageNumber !== null || lineStart !== null);
  const anchorLabel = timestamp !== null
    ? formatTimestamp(timestamp)
    : pageNumber !== null
      ? `Page ${pageNumber}`
      : lineStart !== null
        ? lineEnd !== null && lineEnd !== lineStart ? `Lines ${lineStart}–${lineEnd}` : `Line ${lineStart}`
        : null;
  const shortcutId = `comment-shortcuts-${assetId}-${hasAnchor ? "anchor" : "general"}`;

  function resetComposer() {
    setText("");
    setAudioBlob(null);
    setAudioProgress(null);
    setError(null);
    voiceResetRef.current();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    onSubmitStart?.();
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
        onSubmitError?.();
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

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || !onCancel || isSubmitting) return;
    event.preventDefault();
    onCancel();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      className={`ff-feedback-composer ${hasAnchor ? "is-pinned" : "is-general"} ${compact ? "is-compact" : ""}`}
    >
      <div className="ff-feedback-composer-head">
        <div>
          <h3>{title}</h3>
          {anchorLabel ? <span>{anchorLabel}</span> : null}
        </div>
        {showCharacterCount ? <span className={exceedsTextLimit ? "is-over-limit" : undefined}>{finalText.length}/5000</span> : null}
      </div>

      <label htmlFor={`comment-${assetId}-${hasAnchor ? "anchor" : "general"}`} className="sr-only">Feedback text</label>
      <textarea
        id={`comment-${assetId}-${hasAnchor ? "anchor" : "general"}`}
        value={text}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={5_000}
        rows={hasAnchor ? 3 : 2}
        autoFocus={autoFocus}
        disabled={disabled || isSubmitting}
        placeholder={placeholder}
        aria-describedby={shortcutId}
        aria-keyshortcuts="Enter Shift+Enter Escape"
        className="ff-feedback-composer-textarea"
      />
      <span id={shortcutId} className="sr-only">Press Enter to save feedback, Shift plus Enter for a new line, and Escape to cancel.</span>

      <div className="ff-feedback-composer-voice">
        <VoiceRecorderControl disabled={disabled || isSubmitting} onChange={handleVoiceChange} />
      </div>

      {exceedsTextLimit ? <InlineAlert tone="warning" title="Feedback is too long" className="mt-3">Shorten the note to stay within 5,000 characters.</InlineAlert> : null}

      {stage === "uploading-audio" ? (
        <div role="status" className="ff-feedback-upload-status">
          <span>Uploading voice note{audioProgress ? ` · ${audioProgress.percentage}%` : "…"}</span>
          {audioProgress ? <progress value={audioProgress.percentage} max={100} aria-label="Voice-note upload progress" /> : null}
        </div>
      ) : null}
      {stage === "saving-comment" ? <span role="status" className="sr-only">Saving feedback…</span> : null}
      {error ? <InlineAlert tone="error" title="Feedback was not saved" requestId={error.requestId} className="mt-3">{error.message}</InlineAlert> : null}

      <div className="ff-feedback-composer-actions">
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={isSubmitting} aria-keyshortcuts="Escape" title="Cancel (Esc)" className="ff-feedback-composer-cancel">Cancel</button>
        ) : null}
        <button type="submit" disabled={!canSubmit} aria-keyshortcuts="Enter" title={`${submitLabel} (Enter)`} className="ff-feedback-composer-submit">
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
