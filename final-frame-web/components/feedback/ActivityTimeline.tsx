"use client";

import { useState } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import { useWorkspaceData } from "@/contexts/WorkspaceContext";
import { loadProjectActivity } from "@/lib/api/projects";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { appendOlderActivity } from "@/lib/workspace/state";
import type { ActivityAction } from "@/lib/api/types";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { formatDateTime } from "@/lib/utils/format";

const actionLabels: Readonly<Partial<Record<ActivityAction, string>>> = {
  PROJECT_CREATED: "Project created",
  PROJECT_UPDATED: "Project updated",
  PROJECT_STATUS_CHANGED: "Status changed",
  PROJECT_ARCHIVED: "Project archived",
  PROJECT_REOPENED: "Project reopened",
  DOWNLOAD_UNLOCKED: "Downloads unlocked",
  DOWNLOAD_REVOKED: "Downloads locked",
  MEMBER_ADDED: "Member joined",
  MEMBER_REMOVED: "Member removed",
  INVITE_SENT: "Invitation created",
  ASSET_UPLOADED: "File uploaded",
  ASSET_RENAMED: "File renamed",
  ASSET_DELETED: "File deleted",
  COMMENT_ADDED: "Feedback added",
  COMMENT_RESOLVED: "Feedback resolved",
  COMMENT_REOPENED: "Feedback reopened",
  COMMENT_DELETED: "Feedback deleted",
};

function activityLabel(action: ActivityAction): string {
  const explicitLabel = actionLabels[action];
  if (explicitLabel) return explicitLabel;
  return action
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function activityTone(action: ActivityAction): string {
  if (action.startsWith("COMMENT")) return "bg-emerald-400";
  if (action.startsWith("ASSET")) return "bg-sky-400";
  if (action.startsWith("MEMBER") || action === "INVITE_SENT") return "bg-violet-400";
  if (action.includes("ARCHIVED") || action.includes("REVOKED") || action === "ASSET_DELETED") return "bg-amber-400";
  return "bg-zinc-300";
}

export default function ActivityTimeline() {
  const preferences = useUserPreferences();
  const { projectId, project, setProject } = useWorkspaceData();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  if (!project) return null;

  async function loadMore() {
    const cursor = project?.pageInfo.activityLogs.nextCursor;
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const page = await loadProjectActivity(projectId, { cursor, limit: 50 });
      setProject((current) => current ? appendOlderActivity(current, page.items, page.pageInfo) : current);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setError({
        message: getUserFacingErrorMessage(caught, "More activity could not be loaded."),
        requestId: normalized.requestId,
      });
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (project.activityLogs.length === 0) {
    return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center"><p className="font-semibold text-zinc-300">No activity yet</p><p className="mt-2 text-sm leading-6 text-zinc-500">Project changes and review decisions will appear here.</p></div>;
  }

  return (
    <section aria-label="Project activity history">
      <ol className="space-y-0">
        {project.activityLogs.map((entry, index) => {
          const message = typeof entry.details.message === "string" && entry.details.message.trim()
            ? entry.details.message
            : activityLabel(entry.action);
          return (
            <li key={entry.id} className="relative flex gap-3 pb-6">
              {index < project.activityLogs.length - 1 ? <span className="absolute bottom-0 left-[7px] top-5 w-px bg-white/10" aria-hidden="true" /> : null}
              <span className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-[#080808] ${activityTone(entry.action)}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm leading-6 text-zinc-200">{message}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {entry.user?.name ?? "System"} · <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, preferences)}</time>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {error ? <InlineAlert tone="error" title="Activity could not be loaded" requestId={error.requestId}>{error.message}</InlineAlert> : null}
      {project.pageInfo.activityLogs.hasMore ? (
        <button type="button" onClick={() => void loadMore()} disabled={isLoadingMore} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50">
          {isLoadingMore ? "Loading…" : "Load earlier activity"}
        </button>
      ) : null}
    </section>
  );
}
