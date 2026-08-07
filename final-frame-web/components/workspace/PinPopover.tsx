"use client";

import VoiceNotePlayer from "@/components/feedback/VoiceNotePlayer";
import type { ProjectComment } from "@/lib/api/types";
import { splitFeedbackText } from "@/lib/feedback/transcript";

interface PinPopoverProps {
  projectId: string;
  comment: ProjectComment;
  ownerId: string;
  scale: number;
  position?: { x: number; y: number };
  onClose: () => void;
}

export default function PinPopover({ projectId, comment, ownerId, scale, position, onClose }: PinPopoverProps) {
  const content = splitFeedbackText(comment.text);
  const designer = comment.authorId === ownerId;
  const x = position?.x ?? comment.xPos ?? 50;
  const y = position?.y ?? comment.yPos ?? 50;
  const align = x < 22 ? "translate(0, calc(-100% - 18px))" : x > 78 ? "translate(-100%, calc(-100% - 18px))" : "translate(-50%, calc(-100% - 18px))";

  return (
    <div
      className="absolute z-40 w-[min(19rem,78vw)] rounded-xl border border-white/14 bg-[#111214] p-3 text-left shadow-[0_14px_40px_rgba(0,0,0,0.46)]"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `${align} scale(${1 / scale})`,
        transformOrigin: x < 22 ? "left bottom" : x > 78 ? "right bottom" : "center bottom",
      }}
      role="dialog"
      aria-label="Selected feedback"
      onClick={(event) => event.stopPropagation()}
      data-pin-ignore="true"
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${designer ? "bg-sky-400 text-sky-950" : "bg-emerald-400 text-emerald-950"}`}>
          {(comment.author?.name ?? "U").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{comment.author?.name ?? "Former member"}</p>
          <p className="text-xs text-zinc-500">{designer ? "Designer" : "Client"}{comment.isResolved ? " · Resolved" : ""}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close selected feedback" className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white">×</button>
      </div>

      {comment.hasAudio ? <div className="mt-3"><VoiceNotePlayer compact projectId={projectId} assetId={comment.assetId} commentId={comment.id} initialUrl={comment.audioUrl} /></div> : null}
      {content.note ? <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-5 text-zinc-200">{content.note}</p> : null}
      {content.transcript ? (
        <div className="mt-3 rounded-lg bg-sky-500/[0.07] p-2.5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-300">Transcript</p>
          <p className="mt-1 line-clamp-4 text-sm leading-5 text-zinc-300">{content.transcript}</p>
        </div>
      ) : null}
      {!content.note && !content.transcript && !comment.hasAudio ? <p className="mt-3 text-sm italic text-zinc-500">No comment text</p> : null}
      <div className="absolute bottom-[-7px] h-3.5 w-3.5 rotate-45 border-b border-r border-white/14 bg-[#111214]" style={{ left: x < 22 ? 18 : x > 78 ? "auto" : "50%", right: x > 78 ? 18 : "auto", transform: x >= 22 && x <= 78 ? "translateX(-50%) rotate(45deg)" : "rotate(45deg)" }} aria-hidden="true" />
    </div>
  );
}
