"use client";

import AssetSidebar from "@/components/workspace/AssetSidebar";
import CanvasArea from "@/components/workspace/CanvasArea";
import FeedbackSidebar from "@/components/workspace/FeedbackSidebar";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import LinkButton from "@/components/ui/LinkButton";
import Skeleton from "@/components/ui/Skeleton";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";

function WorkspaceLoading() {
  return (
    <div className="ff-workspace-loading" role="status" aria-live="polite">
      <div className="ff-workspace-loading-bar">
        <Skeleton className="h-9 w-9" />
        <div className="min-w-0 flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3 w-56 max-w-full" /></div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="ff-workspace-loading-body" aria-hidden="true">
        <Skeleton className="ff-workspace-loading-side" />
        <Skeleton className="ff-workspace-loading-canvas" />
        <Skeleton className="ff-workspace-loading-side is-right" />
      </div>
    </div>
  );
}

export default function WorkspaceShell() {
  const { project, isLoading, workspaceIssue, retryWorkspace, realtimeStatus, realtimeMessage } = useWorkspaceData();
  const { isAssetSidebarOpen, isFeedbackSidebarOpen, closeMobileSidebars } = useWorkspaceUI();

  if (isLoading && !project) return <WorkspaceLoading />;

  if (workspaceIssue || !project) {
    const issue = workspaceIssue ?? {
      title: "Workspace unavailable",
      message: "The workspace could not be opened.",
      requestId: null,
      retryable: true,
    };
    return (
      <div className="ff-workspace-failure">
        <div className="w-full max-w-md">
          <EmptyState
            icon="!"
            title={issue.title}
            description={
              <InlineAlert tone={issue.retryable ? "warning" : "error"} requestId={issue.requestId} className="mt-4 text-left">
                {issue.message}
              </InlineAlert>
            }
            action={
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <LinkButton href="/app" variant="secondary">Back to projects</LinkButton>
                {issue.retryable ? <Button variant="primary" onClick={() => void retryWorkspace()}>Try again</Button> : null}
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const showMobileBackdrop = isAssetSidebarOpen || isFeedbackSidebarOpen;
  const showConnectionBanner = realtimeStatus === "offline" || realtimeStatus === "error";

  return (
    <div className="ff-workspace-shell fixed inset-0 z-50 flex flex-col overflow-hidden text-white">
      <a href="#workspace-canvas" className="skip-link">Skip to review canvas</a>
      <WorkspaceHeader />

      {showConnectionBanner ? (
        <div role="status" aria-live="polite" className={`ff-workspace-connection is-${realtimeStatus}`}>
          <span aria-hidden="true" />
          <p>{realtimeMessage}</p>
        </div>
      ) : null}

      <main className="ff-workspace-main" aria-label="Project review workspace">
        {showMobileBackdrop ? (
          <button
            type="button"
            aria-label="Close workspace panel"
            onClick={closeMobileSidebars}
            className="ff-workspace-mobile-backdrop"
          />
        ) : null}
        <AssetSidebar />
        <div id="workspace-canvas" tabIndex={-1} className="ff-workspace-canvas-slot">
          <CanvasArea />
        </div>
        <FeedbackSidebar />
      </main>
    </div>
  );
}
