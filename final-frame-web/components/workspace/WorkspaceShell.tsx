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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#050607] text-white" role="status" aria-live="polite">
      <div className="flex h-16 items-center gap-4 border-b border-white/10 bg-[#08090b] px-4">
        <Skeleton className="h-10 w-10" />
        <div className="min-w-0 flex-1"><Skeleton className="h-4 w-44" /><Skeleton className="mt-2 h-3 w-64 max-w-full" /></div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden w-80 border-r border-white/10 bg-white/[0.018] p-5 lg:block">
          <Skeleton className="h-11 w-full" />
          <div className="mt-5 space-y-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-zinc-800 border-t-emerald-300" />
            <p className="mt-5 text-sm font-semibold text-zinc-300">Opening workspace…</p>
          </div>
        </div>
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050607] px-4 text-white">
        <div className="w-full max-w-xl">
          <EmptyState
            icon="!"
            title={issue.title}
            description={
              <InlineAlert tone={issue.retryable ? "warning" : "error"} requestId={issue.requestId} className="mt-4 text-left">
                {issue.message}
              </InlineAlert>
            }
            action={
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <LinkButton href="/app" variant="secondary">Return to dashboard</LinkButton>
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
        <div role="status" aria-live="polite" className={`flex min-h-11 items-center justify-center border-b px-4 py-2 text-center text-sm font-semibold ${realtimeStatus === "offline" ? "border-amber-300/20 bg-amber-400/10 text-amber-100" : "border-rose-300/20 bg-rose-400/10 text-rose-100"}`}>
          {realtimeMessage} Project actions remain available and will report their status.
        </div>
      ) : null}

      <main className="ff-workspace-main relative flex min-h-0 flex-1 overflow-hidden" aria-label="Project review workspace">
        {showMobileBackdrop ? (
          <button
            type="button"
            aria-label="Close workspace panel"
            onClick={closeMobileSidebars}
            className="absolute inset-0 z-30 bg-black/72 lg:hidden"
          />
        ) : null}
        <AssetSidebar />
        <div id="workspace-canvas" tabIndex={-1} className="flex min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300">
          <CanvasArea />
        </div>
        <FeedbackSidebar />
      </main>
    </div>
  );
}
