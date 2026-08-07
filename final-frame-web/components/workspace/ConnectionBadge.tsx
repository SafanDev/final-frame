"use client";

import type { RealtimeStatus } from "@/contexts/WorkspaceContext";

const statusStyles: Record<RealtimeStatus, { dot: string; text: string; label: string }> = {
  connected: { dot: "bg-emerald-400", text: "text-emerald-200", label: "Live" },
  connecting: { dot: "bg-amber-400 animate-pulse", text: "text-amber-200", label: "Connecting" },
  reconnecting: { dot: "bg-amber-400 animate-pulse", text: "text-amber-200", label: "Reconnecting" },
  offline: { dot: "bg-zinc-500", text: "text-zinc-300", label: "Offline" },
  disconnected: { dot: "bg-zinc-500", text: "text-zinc-300", label: "Disconnected" },
  error: { dot: "bg-rose-400", text: "text-rose-200", label: "Connection issue" },
};

export default function ConnectionBadge({
  status,
  message,
  compact = false,
}: {
  status: RealtimeStatus;
  message: string;
  compact?: boolean;
}) {
  const config = statusStyles[status];
  return (
    <div
      role="status"
      aria-live="polite"
      title={message}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] ${compact ? "px-2.5" : "px-3"}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden="true" />
      <span className={`text-xs font-bold ${config.text}`}>{compact ? config.label : message}</span>
    </div>
  );
}
