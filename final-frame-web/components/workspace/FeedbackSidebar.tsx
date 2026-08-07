"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import ActivityTimeline from "@/components/feedback/ActivityTimeline";
import AiSummaryPanel from "@/components/feedback/AiSummaryPanel";
import CommentCard from "@/components/feedback/CommentCard";
import CommentComposer from "@/components/feedback/CommentComposer";
import CommentDeleteDialog from "@/components/feedback/CommentDeleteDialog";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import SelectMenu from "@/components/ui/SelectMenu";
import { useWorkspaceData, useWorkspaceUI, type ActiveTab } from "@/contexts/WorkspaceContext";
import { listComments } from "@/lib/api/comments";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import type { ProjectComment } from "@/lib/api/types";
import {
  prependOlderWorkspaceComments,
  removeWorkspaceComment,
  setWorkspaceCommentResolved,
  upsertWorkspaceComment,
} from "@/lib/workspace/state";

const roleOptions: ReadonlyArray<{ value: ActiveTab; label: string }> = [
  { value: "ALL", label: "Everyone" },
  { value: "CLIENT", label: "Client only" },
  { value: "DESIGNER", label: "Designer only" },
];

type ResolutionFilter = "ALL" | "OPEN" | "RESOLVED";
const resolutionOptions: ReadonlyArray<{ value: ResolutionFilter; label: string }> = [
  { value: "ALL", label: "Open and resolved" },
  { value: "OPEN", label: "Open only" },
  { value: "RESOLVED", label: "Resolved only" },
];

export default function FeedbackSidebar() {
  const { project, projectId, setProject, activeAsset, filteredComments, isOwner, isLocked, currentUserId } = useWorkspaceData();
  const {
    isFeedbackSidebarOpen,
    setIsFeedbackSidebarOpen,
    rightSidebarTab,
    setRightSidebarTab,
    activeTab,
    setActiveTab,
    activePinId,
    setActivePinId,
    isCompareMode,
  } = useWorkspaceUI();

  const panelTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [resolutionFilter, setResolutionFilter] = useState<ResolutionFilter>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectComment | null>(null);

  useEffect(() => {
    setResolutionFilter("ALL");
    setShowFilters(false);
    setShowComposer(false);
    setLoadError(null);
    setDeleteTarget(null);
  }, [activeAsset?.id]);

  useEffect(() => {
    if (!activePinId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`comment-${activePinId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activePinId]);

  const displayedComments = useMemo(() => [...filteredComments]
    .filter((comment) => resolutionFilter === "ALL" || (resolutionFilter === "OPEN" ? !comment.isResolved : comment.isResolved))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [filteredComments, resolutionFilter]);

  const openCount = activeAsset?.comments.filter((comment) => !comment.isResolved).length ?? 0;
  const hasMoreComments = activeAsset?.commentPageInfo?.hasMore ?? false;

  function handleCreated(comment: ProjectComment) {
    setProject((current) => current ? upsertWorkspaceComment(current, comment.assetId, comment) : current);
    setActivePinId(comment.xPos !== null && comment.yPos !== null ? comment.id : null);
    setShowComposer(false);
    toast.success("Feedback posted.");
  }

  function handleUpdated(comment: ProjectComment) {
    setProject((current) => current ? upsertWorkspaceComment(current, comment.assetId, comment) : current);
    toast.success("Feedback updated.");
  }

  function handleResolved(assetId: string, commentId: string, isResolved: boolean) {
    setProject((current) => current ? setWorkspaceCommentResolved(current, assetId, commentId, isResolved) : current);
    toast.success(isResolved ? "Feedback resolved." : "Feedback reopened.");
  }

  function handleDeleted(comment: ProjectComment) {
    setProject((current) => current ? removeWorkspaceComment(current, comment.assetId, comment.id) : current);
    if (activePinId === comment.id) setActivePinId(null);
    toast.success("Feedback deleted.");
  }

  function handleActivate(comment: ProjectComment) {
    setActivePinId(comment.xPos !== null && comment.yPos !== null ? comment.id : null);
  }

  async function loadOlderComments() {
    const asset = activeAsset;
    const cursor = asset?.commentPageInfo?.nextCursor;
    if (!asset || !cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const page = await listComments(projectId, asset.id, { cursor, limit: 50 });
      setProject((current) => current ? prependOlderWorkspaceComments(current, asset.id, page.items, page.pageInfo) : current);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setLoadError({ message: getUserFacingErrorMessage(caught, "Earlier feedback could not be loaded."), requestId: normalized.requestId });
    } finally {
      setIsLoadingMore(false);
    }
  }

  function handlePanelTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = ["FEEDBACK", "ACTIVITY"] as const;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setRightSidebarTab(tabs[nextIndex]);
    panelTabRefs.current[nextIndex]?.focus();
  }

  if (!isFeedbackSidebarOpen || !project) return null;

  return (
    <aside aria-label="Feedback and activity" className="ff-workspace-feedback flex w-[19rem] shrink-0 flex-col max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[min(20rem,94vw)] max-lg:shadow-[0_20px_55px_rgba(0,0,0,0.55)]">
      <div className="flex items-center justify-between border-b border-white/10 p-2">
        <div role="tablist" aria-label="Workspace details" className="flex rounded-md border border-white/10 bg-black/20 p-0.5">
          {(["FEEDBACK", "ACTIVITY"] as const).map((tab, index) => (
            <button
              key={tab}
              ref={(element) => { panelTabRefs.current[index] = element; }}
              id={`workspace-${tab.toLowerCase()}-tab`}
              type="button"
              role="tab"
              aria-selected={rightSidebarTab === tab}
              aria-controls={`workspace-${tab.toLowerCase()}-panel`}
              tabIndex={rightSidebarTab === tab ? 0 : -1}
              onClick={() => setRightSidebarTab(tab)}
              onKeyDown={(event) => handlePanelTabKeyDown(event, index)}
              className={`min-h-8 rounded px-2.5 text-xs font-bold transition ${rightSidebarTab === tab ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"}`}
            >
              {tab === "FEEDBACK" ? "Feedback" : "Activity"}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsFeedbackSidebarOpen(false)} aria-label="Close feedback panel" className="text-xl lg:hidden">×</Button>
      </div>

      {rightSidebarTab === "ACTIVITY" ? (
        <div id="workspace-activity-panel" role="tabpanel" aria-labelledby="workspace-activity-tab" className="flex-1 overflow-y-auto p-2.5"><ActivityTimeline /></div>
      ) : (
        <div id="workspace-feedback-panel" role="tabpanel" aria-labelledby="workspace-feedback-tab" className="flex min-h-0 flex-1 flex-col">
          {!activeAsset ? (
            <div className="flex flex-1 items-center justify-center p-4"><EmptyState compact title="Select a file" description="Feedback for the selected version will appear here." /></div>
          ) : (
            <>
              <div className="border-b border-white/10 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><h2 className="truncate text-sm font-bold text-white">{activeAsset.fileName}</h2><p className="mt-0.5 text-xs text-zinc-500">v{activeAsset.version} · {openCount} open</p></div>
                  <div className="flex gap-1.5">
                    {!isLocked && !isCompareMode ? <Button size="sm" variant={showComposer ? "secondary" : "primary"} onClick={() => setShowComposer((current) => !current)}>{showComposer ? "Close" : "New"}</Button> : null}
                    <Button size="sm" variant={showFilters ? "secondary" : "ghost"} onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters}>Filter</Button>
                  </div>
                </div>

                {showFilters ? (
                  <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
                    <SelectMenu label="Author" value={activeTab} options={roleOptions} onChange={setActiveTab} />
                    <SelectMenu label="Status" value={resolutionFilter} options={resolutionOptions} onChange={setResolutionFilter} />
                  </div>
                ) : null}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {isCompareMode ? <InlineAlert tone="info" title="Comparison mode">Exit comparison to add or select feedback.</InlineAlert> : null}
                {isLocked ? <InlineAlert tone="warning" title="Read-only project" className="mb-3">Feedback history is preserved but cannot be changed.</InlineAlert> : null}

                {showComposer && !isLocked && !isCompareMode ? (
                  <CommentComposer compact projectId={projectId} assetId={activeAsset.id} title="General feedback" placeholder="Add feedback for the whole file…" onCreated={handleCreated} onCancel={() => setShowComposer(false)} />
                ) : null}

                {isOwner && !isCompareMode ? <div className="mt-3"><AiSummaryPanel projectId={projectId} assetId={activeAsset.id} commentCount={activeAsset.comments.length} /></div> : null}

                <div className="mt-4 flex items-center justify-between"><h3 className="text-sm font-bold text-zinc-300">Comments</h3><span className="text-xs text-zinc-600">{displayedComments.length}</span></div>

                {displayedComments.length === 0 ? (
                  <div className="mt-3"><EmptyState compact title="No matching feedback" description="Add feedback or change the filters." /></div>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    {displayedComments.map((comment) => (
                      <CommentCard
                        key={comment.id}
                        projectId={projectId}
                        ownerId={project.ownerId}
                        currentUserId={currentUserId}
                        comment={comment}
                        isLocked={isLocked}
                        isActive={activePinId === comment.id}
                        onActivate={handleActivate}
                        onUpdated={handleUpdated}
                        onResolved={handleResolved}
                        onRequestDelete={setDeleteTarget}
                      />
                    ))}
                  </div>
                )}

                {loadError ? <InlineAlert tone="error" title="Earlier feedback unavailable" requestId={loadError.requestId} className="mt-3">{loadError.message}</InlineAlert> : null}
                {hasMoreComments ? <Button variant="secondary" onClick={() => void loadOlderComments()} loading={isLoadingMore} loadingLabel="Loading…" className="mt-3 w-full">Load earlier</Button> : null}
              </div>
            </>
          )}
        </div>
      )}

      <CommentDeleteDialog open={Boolean(deleteTarget)} projectId={projectId} comment={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
    </aside>
  );
}
