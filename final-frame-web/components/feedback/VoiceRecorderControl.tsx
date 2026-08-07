"use client";

import { useEffect, useState } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

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
  const recorder = useVoiceRecorder();
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(false);
  const combinedTranscript = [recorder.transcript, recorder.interimTranscript].filter(Boolean).join(" ").trim();

  useEffect(() => {
    onChange({
      blob: recorder.blob,
      transcript: combinedTranscript,
      transcriptionSupported: recorder.transcriptionSupported,
      reset: recorder.reset,
    });
  }, [combinedTranscript, onChange, recorder.blob, recorder.reset, recorder.transcriptionSupported]);

  if (!recorder.isSupported) {
    return <p className="text-sm leading-5 text-zinc-500">Voice notes are unavailable in this browser.</p>;
  }

  return (
    <div className="space-y-2">
      {recorder.status === "idle" && recorder.transcriptionSupported ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <label className="flex items-start gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={transcriptionEnabled}
              onChange={(event) => setTranscriptionEnabled(event.target.checked)}
              disabled={disabled}
              className="mt-0.5 h-4 w-4 accent-emerald-400"
            />
            <span>
              <span className="block font-semibold text-white">Enable browser live transcription</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500">
                Optional. Your browser or its speech-service provider may process spoken audio to create text. Leave this off and type a transcript manually when privacy requirements prohibit that processing.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {recorder.status === "idle" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void recorder.start({ transcribe: transcriptionEnabled })}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.025] px-3 text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          Record voice note
        </button>
      ) : null}

      {recorder.status === "requesting" ? (
        <p role="status" className="text-sm text-zinc-500">Requesting microphone access…</p>
      ) : null}

      {recorder.status === "recording" ? (
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-400" aria-hidden="true" />
            <span role="timer" className="font-mono text-sm font-bold text-rose-100">{formatDuration(recorder.elapsedSeconds)}</span>
            <span className="text-sm text-rose-100/70">Recording</span>
            <button type="button" onClick={recorder.stop} className="ml-auto min-h-9 rounded-lg bg-rose-300 px-3 text-sm font-bold text-rose-950 hover:bg-rose-200">Stop</button>
          </div>
          {combinedTranscript ? (
            <p className="mt-3 max-h-24 overflow-y-auto rounded-lg bg-black/20 p-2 text-sm leading-5 text-rose-50" aria-live="polite">
              {combinedTranscript}
            </p>
          ) : recorder.transcriptionSupported && transcriptionEnabled ? (
            <p className="mt-3 text-xs text-rose-100/60">Live transcript will appear here while speaking.</p>
          ) : null}
        </div>
      ) : null}

      {recorder.status === "ready" && recorder.blob ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <audio controls preload="metadata" src={recorder.previewUrl} className="custom-audio-player h-10 w-full" aria-label="Voice-note preview" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-500">{formatDuration(recorder.elapsedSeconds)} · attached</span>
            <button type="button" onClick={recorder.reset} className="min-h-9 rounded-lg px-3 text-sm font-semibold text-zinc-300 hover:bg-white/5 hover:text-white">Discard</button>
          </div>
          {combinedTranscript ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Draft transcript</p>
              <p className="mt-1 text-sm leading-6 text-zinc-200">{combinedTranscript}</p>
            </div>
          ) : recorder.transcriptionSupported && transcriptionEnabled ? (
            <p className="mt-3 text-xs text-zinc-500">No speech was recognised. The transcript can be typed below before posting.</p>
          ) : null}
        </div>
      ) : null}

      {recorder.transcriptionError ? (
        <InlineAlert tone="warning" title="Transcription paused">
          {recorder.transcriptionError}
        </InlineAlert>
      ) : null}

      {recorder.status === "error" && recorder.error ? (
        <InlineAlert tone="error" title="Voice recording failed">
          <p>{recorder.error}</p>
          <button type="button" onClick={recorder.reset} className="mt-2 min-h-9 rounded-lg border border-current/25 px-3 text-sm font-bold hover:bg-white/5">Dismiss</button>
        </InlineAlert>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {recorder.status === "ready" && recorder.blob ? "Voice note attached." : ""}
      </span>
    </div>
  );
}
