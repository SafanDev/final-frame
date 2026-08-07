"use client";

import { useRef } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import { useCommentAudioUrl } from "@/hooks/useCommentAudioUrl";

interface VoiceNotePlayerProps {
  projectId: string;
  assetId: string;
  commentId: string;
  initialUrl?: string;
  compact?: boolean;
}

export default function VoiceNotePlayer({
  projectId,
  assetId,
  commentId,
  initialUrl = "",
  compact = false,
}: VoiceNotePlayerProps) {
  const refreshedAfterError = useRef(false);
  const audio = useCommentAudioUrl(
    projectId,
    assetId,
    commentId,
    true,
    initialUrl,
  );

  async function handleMediaError() {
    if (refreshedAfterError.current) return;
    refreshedAfterError.current = true;
    await audio.refresh();
  }

  if (audio.isLoading && !audio.url) {
    return <p role="status" className="text-sm text-zinc-500">Loading voice note…</p>;
  }

  if (audio.error && !audio.url) {
    return (
      <InlineAlert tone="error" title="Voice note unavailable" requestId={audio.requestId}>
        <p>{audio.error}</p>
        <button type="button" onClick={() => void audio.refresh()} className="mt-2 min-h-9 rounded-lg border border-current/25 px-3 text-sm font-bold hover:bg-white/5">Try again</button>
      </InlineAlert>
    );
  }

  return audio.url ? (
    <audio
      controls
      preload="metadata"
      src={audio.url}
      onError={() => void handleMediaError()}
      className={`custom-audio-player w-full min-w-0 ${compact ? "h-9" : "h-10"}`}
      aria-label="Voice-note recording"
    >
      The browser does not support audio playback.
    </audio>
  ) : null;
}
