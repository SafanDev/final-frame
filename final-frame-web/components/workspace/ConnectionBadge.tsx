"use client";

import type { RealtimeStatus } from "@/contexts/WorkspaceContext";

const statusStyles: Record<RealtimeStatus, { dot: string; label: string }> = {
  connected: { dot: "is-live", label: "Live" },
  connecting: { dot: "is-waiting", label: "Connecting" },
  reconnecting: { dot: "is-waiting", label: "Reconnecting" },
  offline: { dot: "is-offline", label: "Offline" },
  disconnected: { dot: "is-offline", label: "Offline" },
  error: { dot: "is-error", label: "Connection issue" },
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
    <div role="status" aria-live="polite" title={message} className={`ff-workspace-live-state ${compact ? "is-compact" : ""}`}>
      <span className={config.dot} aria-hidden="true" />
      <span>{config.label}</span>
    </div>
  );
}
