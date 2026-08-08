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
import { listComments, setCommentResolved } from "@/lib/api/comments";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { loadFeedbackDraft } from "@/lib/workspace/review-session";
import { nextOpenFeedback } from "@/lib/workspace/review-navigation";
import { copyTextToClipboard } from "@/lib/utils/clipboard";
import WorkspaceIcon from "@/components/workspace/WorkspaceIcon";
import type { ProjectComment } from "@/lib/api/types";
import {
  prependOlderWorkspaceComments,
  removeWorkspaceComment,
  replaceWorkspaceComment,
  setWorkspaceCommentResolved,
  upsertWorkspaceComment,
} from "@/lib/workspace/state";

const roleOptions: ReadonlyArray<{ value: ActiveTab; label: string }> = [
  { value: "ALL", label: "Everyone" },
  { value: "CLIENT", label: "Reviewers" },
  { value: "DESIGNER", label: "Owner" },
];

type ResolutionFilter = "ALL" | "OPEN" | "RESOLVED";
const resolutionOptions: ReadonlyArray<{ value: ResolutionFilter; label: string }> = [
  { value: "ALL", label: "Open and resolved" },
  { value: "OPEN", label: "Open only" },
  { value: "RESOLVED", label: "Resolved only" },
];

export default function FeedbackSidebar() {
  const { project, projectId, setProject, activeAsset, filteredComments, isOwner, isLocked, isOnline, currentUserId } = useWorkspaceData();
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
    openFeedbackSidebar,
    closeMobileSidebars,
  } = useWorkspaceUI();

  const panelTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileFeedbackReturnRef = useRef(false);
  const [resolutionFilter, setResolutionFilter] = useState<ResolutionFilter>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [hasGeneralDraft, setHasGeneralDraft] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectComment | null>(null);

  useEffect(() => {
    setResolutionFilter("ALL");
    setShowFilters(false);
    setShowComposer(false);
    setHasGeneralDraft(Boolean(activeAsset?.id && currentUserId && loadFeedbackDraft(currentUserId, projectId, activeAsset.id, "general").trim()));
    setLoadError(null);
    setDeleteTarget(null);
  }, [activeAsset?.id, currentUserId, projectId]);

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
  const resolvedCount = activeAsset?.comments.filter((comment) => comment.isResolved).length ?? 0;
  const hasMoreComments = activeAsset?.commentPageInfo?.hasMore ?? false;
  const currentUser = project && currentUserId
    ? project.ownerId === currentUserId
      ? project.owner
      : project.members.find((member) => member.userId === currentUserId)?.user ?? null
    : null;

  function handleCreated(comment: ProjectComment) {
    setProject((current) => current ? upsertWorkspaceComment(current, comment.assetId, comment) : current);
    // Newly saved feedback never steals focus; the user can select its pin explicitly.
    setActivePinId(null);
    setShowComposer(false);
    setHasGeneralDraft(false);
    toast.success("Feedback posted.");
  }

  function toggleGeneralComposer() {
    if (showComposer && activeAsset && currentUserId) {
      setHasGeneralDraft(Boolean(loadFeedbackDraft(currentUserId, projectId, activeAsset.id, "general").trim()));
    }
    setShowComposer((current) => !current);
  }

  function cancelGeneralComposer() {
    setHasGeneralDraft(false);
    setShowComposer(false);
  }

  function handleUpdated(comment: ProjectComment) {
    setProject((current) => current ? upsertWorkspaceComment(current, comment.assetId, comment) : current);
  }

  function handleResolved(assetId: string, commentId: string, isResolved: boolean, announce = true) {
    setProject((current) => current ? setWorkspaceCommentResolved(current, assetId, commentId, isResolved) : current);
    if (!announce) return;
    toast.success(isResolved ? "Feedback resolved." : "Feedback reopened.", {
      description: isResolved && openCount > 1 ? "Use Next open to continue reviewing." : undefined,
      action: {
        label: "Undo",
        onClick: () => {
          if (!isOnline) {
            toast.error("Reconnect to undo this change.");
            return;
          }
          void setCommentResolved(projectId, assetId, commentId, !isResolved)
            .then(() => {
              setProject((current) => current ? setWorkspaceCommentResolved(current, assetId, commentId, !isResolved) : current);
              toast.success(isResolved ? "Feedback reopened." : "Feedback resolved.");
            })
            .catch((caught) => toast.error(getUserFacingErrorMessage(caught, "The change could not be undone.")));
        },
      },
    });
  }

  function handleDeleted(comment: ProjectComment) {
    setProject((current) => current ? removeWorkspaceComment(current, comment.assetId, comment.id) : current);
    if (activePinId === comment.id) setActivePinId(null);
  }

  function handleDeleteFailed(comment: ProjectComment, failure: { message: string; requestId: string | null }) {
    setProject((current) => current ? upsertWorkspaceComment(current, comment.assetId, comment) : current);
    toast.error(failure.message, {
      description: failure.requestId ? `Support reference: ${failure.requestId}` : "The feedback was restored.",
    });
  }

  function handleOptimisticCreated(comment: ProjectComment) {
    setProject((current) => current ? upsertWorkspaceComment(current, comment.assetId, comment) : current);
    setShowComposer(false);
    setHasGeneralDraft(false);
  }

  function handleOptimisticSettled(temporaryId: string, comment: ProjectComment) {
    setProject((current) => current ? replaceWorkspaceComment(current, comment.assetId, temporaryId, comment) : current);
  }

  function handleOptimisticFailed(comment: ProjectComment, failure: { message: string; requestId: string | null }) {
    setProject((current) => current ? removeWorkspaceComment(current, comment.assetId, comment.id) : current);
    if (activeAsset?.id === comment.assetId) {
      setShowComposer(true);
      setHasGeneralDraft(true);
    }
    toast.error(failure.message, {
      description: failure.requestId ? `Support reference: ${failure.requestId}` : "Your draft was restored.",
    });
  }

  function focusFeedback(comment: ProjectComment, allowToggle = true) {
    const nextId = allowToggle && activePinId === comment.id ? null : comment.id;
    setRightSidebarTab("FEEDBACK");
    setActivePinId(nextId);
    if (!nextId) return;

    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    if (mobile && comment.anchorType !== "GENERAL") {
      mobileFeedbackReturnRef.current = true;
      window.history.pushState({ ...(window.history.state ?? {}), ffFeedbackReturn: projectId }, "", window.location.href);
      closeMobileSidebars();
    } else {
      openFeedbackSidebar();
    }
  }

  function handleActivate(comment: ProjectComment) {
    focusFeedback(comment, true);
  }

  function navigateOpenFeedback(direction: -1 | 1) {
    if (!activeAsset) return;
    const next = nextOpenFeedback(activeAsset.comments, activePinId, direction);
    if (!next) {
      toast("No open feedback on this file.");
      return;
    }
    focusFeedback(next, false);
  }

  async function copyFileName() {
    if (!activeAsset) return;
    try {
      await copyTextToClipboard(activeAsset.fileName);
      toast.success("File name copied.");
    } catch {
      toast.error("Could not copy the file name.");
    }
  }

  useEffect(() => {
    const handleReviewKeys = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!["j", "k", "J", "K"].includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, button, a, summary, [contenteditable='true']")) return;
      event.preventDefault();
      navigateOpenFeedback(event.key.toLowerCase() === "j" ? 1 : -1);
    };
    window.addEventListener("keydown", handleReviewKeys);
    return () => window.removeEventListener("keydown", handleReviewKeys);
  });

  useEffect(() => {
    const handlePopState = () => {
      if (!mobileFeedbackReturnRef.current) return;
      mobileFeedbackReturnRef.current = false;
      setRightSidebarTab("FEEDBACK");
      openFeedbackSidebar();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [openFeedbackSidebar, projectId, setRightSidebarTab]);

  useEffect(() => {
    if (!activeAsset || !activePinId || !window.matchMedia("(max-width: 1023px)").matches) return;
    const selected = activeAsset.comments.find((comment) => comment.id === activePinId);
    if (selected?.anchorType === "GENERAL") openFeedbackSidebar();
  }, [activeAsset, activePinId, openFeedbackSidebar]);

  useEffect(() => {
    const asset = activeAsset;
    const targetId = activePinId;
    if (!asset || !targetId || asset.comments.some((comment) => comment.id === targetId) || !asset.commentPageInfo?.hasMore) return;
    let cancelled = false;
    let cursor = asset.commentPageInfo.nextCursor;

    const findLinkedFeedback = async () => {
      for (let pageCount = 0; cursor && pageCount < 20 && !cancelled; pageCount += 1) {
        const page = await listComments(projectId, asset.id, { cursor, limit: 50 });
        if (cancelled) return;
        setProject((current) => current ? prependOlderWorkspaceComments(current, asset.id, page.items, page.pageInfo) : current);
        if (page.items.some((comment) => comment.id === targetId)) return;
        cursor = page.pageInfo.nextCursor;
      }
    };

    void findLinkedFeedback().catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeAsset, activePinId, projectId, setProject]);

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
    <aside aria-label="Feedback and activity" className="ff-workspace-feedback">
      <div className="ff-workspace-feedback-tabs">
        <div role="tablist" aria-label="Workspace details" className="ff-workspace-tablist">
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
              className={`ff-workspace-tab ${rightSidebarTab === tab ? "is-active" : ""}`}
            >
              {tab === "FEEDBACK" ? "Feedback" : "Activity"}
            </button>
          ))}
        </div>
        <div className="ff-workspace-feedback-tab-tools">
          {rightSidebarTab === "FEEDBACK" && activeAsset && isOwner && !isCompareMode && activeAsset.comments.length > 0 ? (
            <AiSummaryPanel projectId={projectId} assetId={activeAsset.id} commentCount={activeAsset.comments.length} />
          ) : null}
          <Button variant="ghost" size="icon" onClick={() => setIsFeedbackSidebarOpen(false)} aria-label="Close feedback panel" className="ff-workspace-mobile-close lg:hidden">×</Button>
        </div>
      </div>

      {rightSidebarTab === "ACTIVITY" ? (
        <div id="workspace-activity-panel" role="tabpanel" aria-labelledby="workspace-activity-tab" className="ff-workspace-panel-scroll"><ActivityTimeline /></div>
      ) : (
        <div id="workspace-feedback-panel" role="tabpanel" aria-labelledby="workspace-feedback-tab" className="ff-workspace-feedback-panel">
          {!activeAsset ? (
            <div className="flex flex-1 items-center justify-center p-4"><EmptyState compact title="Select a file" description="Feedback for the selected version will appear here." /></div>
          ) : (
            <>
              <div className="ff-workspace-feedback-head">
                <div className="ff-workspace-feedback-context">
                  <div className="ff-workspace-feedback-file">
                    <div className="ff-workspace-feedback-file-line">
                      <h2 title={activeAsset.fileName}>{activeAsset.fileName}</h2>
                      <button type="button" onClick={() => void copyFileName()} aria-label="Copy file name" data-tooltip="Copy file name" className="ff-workspace-mini-icon"><WorkspaceIcon name="copy" /></button>
                    </div>
                    <p>{openCount} open · {resolvedCount} resolved{hasMoreComments ? " · more" : ""}</p>
                  </div>
                  {!isLocked && !isCompareMode ? <Button className="ff-workspace-feedback-add" size="sm" variant={showComposer ? "secondary" : "primary"} onClick={toggleGeneralComposer}>{showComposer ? "Close" : hasGeneralDraft ? "Continue" : "+ Add"}</Button> : null}
                </div>

                {showFilters ? (
                  <div className="ff-workspace-feedback-filters">
                    <SelectMenu label="Author" value={activeTab} options={roleOptions} onChange={setActiveTab} />
                    <SelectMenu label="Status" value={resolutionFilter} options={resolutionOptions} onChange={setResolutionFilter} />
                  </div>
                ) : null}
              </div>

              <div className="ff-workspace-feedback-scroll">
                {isCompareMode ? <InlineAlert tone="info" title="Comparison mode">Exit comparison to add or select feedback.</InlineAlert> : null}
                {isLocked ? <InlineAlert tone="warning" title="Read-only project" className="mb-3">Feedback history is preserved but cannot be changed.</InlineAlert> : null}

                {showComposer && !isLocked && !isCompareMode ? (
                  <CommentComposer compact projectId={projectId} assetId={activeAsset.id} currentUserId={currentUserId ?? "anonymous"} currentUser={currentUser} isOnline={isOnline} title="General feedback" placeholder="Write a note about this file…" submitLabel="Post" onCreated={handleCreated} onOptimisticCreated={handleOptimisticCreated} onOptimisticSettled={handleOptimisticSettled} onOptimisticFailed={handleOptimisticFailed} onCancel={cancelGeneralComposer} />
                ) : null}

                <div className="ff-workspace-comments-head">
                  <div className="ff-workspace-comments-title"><h3>Comments</h3><span>{displayedComments.length}</span></div>
                  <div className="ff-workspace-comments-tools">
                    {openCount > 0 ? <button type="button" onClick={() => navigateOpenFeedback(1)} aria-label="Next open feedback" aria-keyshortcuts="J" data-tooltip="Next open · J" className="ff-workspace-mini-icon"><WorkspaceIcon name="next" /></button> : null}
                    <button type="button" onClick={() => setShowFilters((current) => !current)} aria-label="Filter feedback" aria-expanded={showFilters} data-tooltip="Filter feedback" className={`ff-workspace-mini-icon ${showFilters ? "is-active" : ""}`}><WorkspaceIcon name="filter" /></button>
                  </div>
                </div>

                {displayedComments.length === 0 ? (
                  <div className="ff-workspace-feedback-empty">
                    <span aria-hidden="true">{showFilters || resolutionFilter !== "ALL" || activeTab !== "ALL" ? "⌕" : "+"}</span>
                    <strong>{showFilters || resolutionFilter !== "ALL" || activeTab !== "ALL" ? "No matches" : "No feedback yet"}</strong>
                    <p>{showFilters || resolutionFilter !== "ALL" || activeTab !== "ALL" ? "Try another filter." : isLocked ? "Feedback will appear here." : "Click the preview to pin a note, or use Add for general feedback."}</p>
                  </div>
                ) : (
                  <div className="ff-workspace-comment-list">
                    {displayedComments.map((comment) => (
                      <CommentCard
                        key={comment.id}
                        projectId={projectId}
                        ownerId={project.ownerId}
                        currentUserId={currentUserId}
                        comment={comment}
                        isLocked={isLocked}
                        isOnline={isOnline}
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

      <CommentDeleteDialog open={Boolean(deleteTarget)} projectId={projectId} comment={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} onFailed={handleDeleteFailed} />
    </aside>
  );
}
