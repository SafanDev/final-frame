"use client";

import { useEffect, useId } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { setWorkspaceWorkflowBlocker } from "@/lib/workspace/workflow-safety";

export interface VoiceRecordingValue {
  blob: Blob | null;
  transcript: string;
  transcriptionSupported: boolean;
  reset: () => void;
}

interface VoiceRecorderControlProps {
  disabled?: boolean;
  onChange: (value: VoiceRecordingValue) => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function VoiceRecorderControl({ disabled = false, onChange }: VoiceRecorderControlProps) {
  const blockerId = useId();
  const recorder = useVoiceRecorder();

  useEffect(() => {
    onChange({
      blob: recorder.blob,
      transcript: "",
      transcriptionSupported: false,
      reset: recorder.reset,
    });
  }, [onChange, recorder.blob, recorder.reset]);

  useEffect(() => {
    const blocksLeaving = recorder.status === "requesting" || recorder.status === "recording" || recorder.status === "ready";
    setWorkspaceWorkflowBlocker(
      blockerId,
      blocksLeaving ? "A voice note is recording or attached but has not been posted yet." : null,
    );
    return () => setWorkspaceWorkflowBlocker(blockerId, null);
  }, [blockerId, recorder.status]);

  if (!recorder.isSupported) return null;

  return (
    <div className="ff-voice-recorder">
      {recorder.status === "idle" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void recorder.start({ transcribe: false })}
          className="ff-voice-record-button"
        >
          <span aria-hidden="true" className="ff-voice-record-dot" />
          Record voice note
        </button>
      ) : null}

      {recorder.status === "requesting" ? <p role="status" className="ff-voice-status">Opening microphone…</p> : null}

      {recorder.status === "recording" ? (
        <div className="ff-voice-recording">
          <span className="ff-voice-record-dot is-live" aria-hidden="true" />
          <span role="timer" className="ff-voice-timer">{formatDuration(recorder.elapsedSeconds)}</span>
          <span>Recording</span>
          <button type="button" onClick={recorder.stop}>Stop</button>
        </div>
      ) : null}

      {recorder.status === "ready" && recorder.blob ? (
        <div className="ff-voice-ready">
          <audio controls preload="metadata" src={recorder.previewUrl} className="custom-audio-player" aria-label="Voice-note preview" />
          <div>
            <span>{formatDuration(recorder.elapsedSeconds)} attached</span>
            <button type="button" onClick={recorder.reset}>Discard</button>
          </div>
        </div>
      ) : null}

      {recorder.status === "error" && recorder.error ? (
        <InlineAlert tone="error" title="Voice recording failed">
          <p>{recorder.error}</p>
          <button type="button" onClick={recorder.reset} className="mt-2 min-h-9 rounded-lg border border-current/25 px-3 text-sm font-bold hover:bg-white/5">Dismiss</button>
        </InlineAlert>
      ) : null}

      <span className="sr-only" aria-live="polite">{recorder.status === "ready" && recorder.blob ? "Voice note attached." : ""}</span>
    </div>
  );
}
