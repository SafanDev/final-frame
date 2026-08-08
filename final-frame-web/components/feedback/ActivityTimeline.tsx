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
  if (action.startsWith("COMMENT")) return "is-feedback";
  if (action.startsWith("ASSET")) return "is-file";
  if (action.startsWith("MEMBER") || action === "INVITE_SENT") return "is-people";
  if (action.includes("ARCHIVED") || action.includes("REVOKED") || action === "ASSET_DELETED") return "is-warning";
  return "is-neutral";
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
    return <div className="ff-workspace-activity-empty"><span aria-hidden="true">·</span><strong>No activity yet</strong><p>Project changes will appear here.</p></div>;
  }

  return (
    <section aria-label="Project activity history" className="ff-workspace-activity">
      <ol>
        {project.activityLogs.map((entry) => {
          const message = typeof entry.details.message === "string" && entry.details.message.trim()
            ? entry.details.message
            : activityLabel(entry.action);
          return (
            <li key={entry.id}>
              <span className={`ff-workspace-activity-dot ${activityTone(entry.action)}`} aria-hidden="true" />
              <div className="min-w-0">
                <p>{message}</p>
                <small>{entry.user?.name ?? "System"} · <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, preferences)}</time></small>
              </div>
            </li>
          );
        })}
      </ol>
      {error ? <InlineAlert tone="error" title="Activity could not be loaded" requestId={error.requestId}>{error.message}</InlineAlert> : null}
      {project.pageInfo.activityLogs.hasMore ? (
        <button type="button" onClick={() => void loadMore()} disabled={isLoadingMore} className="ff-workspace-activity-more">
          {isLoadingMore ? "Loading…" : "Earlier activity"}
        </button>
      ) : null}
    </section>
  );
}
