"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { renameAssetStack } from "@/lib/api/assets";
import AssetDownloadButton from "@/components/assets/AssetDownloadButton";
import ProjectFormDialog, { type ProjectFormValues } from "@/components/dashboard/ProjectFormDialog";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import ConnectionBadge from "@/components/workspace/ConnectionBadge";
import WorkspaceControlRow from "@/components/workspace/WorkspaceControlRow";
import WorkspaceIcon from "@/components/workspace/WorkspaceIcon";
import InviteProjectDialog from "@/components/workspace/InviteProjectDialog";
import MemberManagerDialog from "@/components/workspace/MemberManagerDialog";
import PresenceList from "@/components/workspace/PresenceList";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { normalizeAssetFileName } from "@/lib/assets/file-policy";
import {
  downloadApprovalCertificate,
  downloadProjectAudit,
  transitionProjectReview,
  updateProject,
} from "@/lib/api/projects";
import type { ProjectStatus } from "@/lib/api/types";

const statusTone: Record<ProjectStatus, BadgeTone> = {
  DRAFT: "neutral",
  IN_REVIEW: "info",
  CHANGES_REQUESTED: "warning",
  APPROVED: "success",
};

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel: string;
  input: {
    status?: ProjectStatus;
    isArchived?: boolean;
    isDownloadUnlocked?: boolean;
  };
}

function projectStatusLabel(status: ProjectStatus): string {
  if (status === "DRAFT") return "Draft";
  if (status === "CHANGES_REQUESTED") return "Changes";
  if (status === "APPROVED") return "Approved";
  return "In review";
}

export default function WorkspaceHeader() {
  const {
    projectId,
    project,
    setProject,
    isOwner,
    activeAsset,
    activeUsers,
    realtimeStatus,
    realtimeMessage,
    isRefreshing,
    refreshWorkspace,
  } = useWorkspaceData();
  const {
    isAssetSidebarOpen,
    setIsAssetSidebarOpen,
    isFeedbackSidebarOpen,
    setIsFeedbackSidebarOpen,
  } = useWorkspaceUI();

  const controlRef = useRef<HTMLDivElement | null>(null);
  const controlTriggerRef = useRef<HTMLButtonElement | null>(null);
  const firstControlRef = useRef<HTMLButtonElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [downloadingRecord, setDownloadingRecord] = useState<"certificate" | "audit" | null>(null);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isTitleSaving, setIsTitleSaving] = useState(false);
  const [isRenamingFile, setIsRenamingFile] = useState(false);
  const [fileDraft, setFileDraft] = useState("");
  const [isFileSaving, setIsFileSaving] = useState(false);

  useEffect(() => {
    if (!isControlsOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlRef.current?.contains(event.target) && !controlTriggerRef.current?.contains(event.target)) {
        setIsControlsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsControlsOpen(false);
      controlTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    const frame = window.requestAnimationFrame(() => firstControlRef.current?.focus());
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.cancelAnimationFrame(frame);
    };
  }, [isControlsOpen]);

  useEffect(() => {
    if (!isRenamingTitle) return;
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isRenamingTitle]);

  useEffect(() => {
    if (!isRenamingFile) return;
    const frame = window.requestAnimationFrame(() => {
      fileInputRef.current?.focus();
      fileInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isRenamingFile]);

  useEffect(() => {
    setIsRenamingFile(false);
    setFileDraft("");
  }, [activeAsset?.id]);

  if (!project) return null;
  const currentProject = project;
  const canDownload = Boolean(isOwner || project.isDownloadUnlocked);
  const focusMode = !isAssetSidebarOpen && !isFeedbackSidebarOpen;
  const signedApproval = project.latestSignedApproval;
  const canQuickRename = isOwner && !project.isArchived && (project.status === "DRAFT" || project.status === "CHANGES_REQUESTED");
  const canQuickRenameFile = canQuickRename && Boolean(activeAsset);

  function startTitleRename() {
    if (!canQuickRename || isTitleSaving) return;
    setTitleDraft(currentProject.title);
    setIsRenamingTitle(true);
  }

  function cancelTitleRename() {
    if (isTitleSaving) return;
    setTitleDraft("");
    setIsRenamingTitle(false);
  }

  async function saveTitleRename(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canQuickRename || isTitleSaving) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === currentProject.title) {
      cancelTitleRename();
      return;
    }

    setIsTitleSaving(true);
    try {
      const updated = await updateProject(projectId, { title: nextTitle, expectedVersion: currentProject.version });
      setProject((current) => current ? { ...current, ...updated } : current);
      setIsRenamingTitle(false);
      setTitleDraft("");
      toast.success("Project renamed.");
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (normalized.status === 409) await refreshWorkspace("title-conflict", true);
      toast.error(getUserFacingErrorMessage(caught, "The project name could not be changed."));
    } finally {
      setIsTitleSaving(false);
    }
  }

  function handleTitleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelTitleRename();
  }

  function startFileRename() {
    if (!canQuickRenameFile || !activeAsset || isFileSaving) return;
    setFileDraft(activeAsset.fileName);
    setIsRenamingFile(true);
  }

  function cancelFileRename() {
    if (isFileSaving) return;
    setFileDraft("");
    setIsRenamingFile(false);
  }

  async function saveFileRename(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canQuickRenameFile || !activeAsset || isFileSaving) return;
    const nextFileName = normalizeAssetFileName(fileDraft);
    if (!nextFileName) {
      toast.error("Enter a valid file name.");
      return;
    }
    if (nextFileName === activeAsset.fileName) {
      cancelFileRename();
      return;
    }

    const targetStackKey = activeAsset.stackKey;
    setIsFileSaving(true);
    try {
      const result = await renameAssetStack(projectId, activeAsset.id, nextFileName, currentProject.version);
      setProject((current) => {
        if (!current) return current;
        const renamedAssetIds = new Set(current.assets.filter((asset) => asset.stackKey === targetStackKey).map((asset) => asset.id));
        return {
          ...current,
          version: result.projectVersion,
          assets: current.assets.map((asset) => asset.stackKey === targetStackKey ? { ...asset, fileName: result.fileName } : asset),
          finalAsset: current.finalAsset && renamedAssetIds.has(current.finalAsset.id)
            ? { ...current.finalAsset, fileName: result.fileName }
            : current.finalAsset,
        };
      });
      setIsRenamingFile(false);
      setFileDraft("");
      toast.success("File renamed.");
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (normalized.status === 409) await refreshWorkspace("file-rename-conflict", true);
      toast.error(getUserFacingErrorMessage(caught, "The file could not be renamed."));
    } finally {
      setIsFileSaving(false);
    }
  }

  function handleFileKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelFileRename();
  }

  async function applyProjectUpdate(
    input: ConfirmAction["input"] & { title?: string; description?: string | null },
    successMessage: string,
  ) {
    setIsMutating(true);
    try {
      if (input.status) {
        await transitionProjectReview(projectId, {
          status: input.status,
          ...(input.status === "CHANGES_REQUESTED" ? { reason: revisionReason.trim() } : {}),
          expectedVersion: currentProject.version,
        });
        await refreshWorkspace("project-updated", true);
      } else {
        const projectFields = {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
          ...(input.isDownloadUnlocked !== undefined
            ? { isDownloadUnlocked: input.isDownloadUnlocked }
            : {}),
        };
        const updated = await updateProject(projectId, {
          ...projectFields,
          expectedVersion: currentProject.version,
        });
        setProject((current) => current ? { ...current, ...updated } : current);
      }
      toast.success(successMessage);
      setConfirmAction(null);
      setRevisionReason("");
      setIsControlsOpen(false);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (normalized.status === 409) await refreshWorkspace("conflict", true);
      toast.error(getUserFacingErrorMessage(caught, "The project could not be updated."), {
        description: normalized.requestId ? `Support reference: ${normalized.requestId}` : undefined,
      });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSettingsSubmit(values: ProjectFormValues) {
    await applyProjectUpdate({ title: values.title, description: values.description?.trim() || null }, "Project details updated.");
  }

  function requestStatus(status: ProjectStatus) {
    const approved = status === "APPROVED";
    const revision = status === "CHANGES_REQUESTED";
    const withdrawing = status === "DRAFT";
    setRevisionReason("");
    setConfirmAction({
      title: approved
        ? "Approve this project?"
        : revision
          ? "Request changes?"
          : withdrawing
            ? "Withdraw this review?"
            : "Submit for review?",
      message: approved
        ? "This records final Client approval for the selected file."
        : revision
          ? "Explain the changes the Designer should make before resubmitting."
          : withdrawing
            ? "The Designer can edit files again and submit a new review when ready."
            : "The selected final file will be frozen while the client reviews it.",
      confirmLabel: approved
        ? "Approve project"
        : revision
          ? "Request changes"
          : withdrawing
            ? "Withdraw review"
            : "Submit for review",
      input: { status },
    });
    setIsControlsOpen(false);
  }

  function toggleFocusMode() {
    if (focusMode) {
      setIsAssetSidebarOpen(true);
      setIsFeedbackSidebarOpen(true);
    } else {
      setIsAssetSidebarOpen(false);
      setIsFeedbackSidebarOpen(false);
    }
  }

  async function downloadRecord(kind: "certificate" | "audit") {
    if (downloadingRecord) return;
    setDownloadingRecord(kind);
    try {
      if (kind === "certificate") {
        if (!signedApproval) throw new Error("A signed approval certificate is not available yet.");
        await downloadApprovalCertificate(projectId, signedApproval.id);
        toast.success("Approval certificate downloaded.");
      } else {
        await downloadProjectAudit(projectId);
        toast.success("Project audit export downloaded.");
      }
      setIsControlsOpen(false);
    } catch (caught) {
      toast.error(getUserFacingErrorMessage(caught, "The project record could not be downloaded."));
    } finally {
      setDownloadingRecord(null);
    }
  }



  return (
    <>
      <header className="ff-safe-top ff-workspace-header">
        <div className="ff-workspace-header-nav">
          <Link href="/app" aria-label="Return to project dashboard" className="ff-workspace-back">
            <WorkspaceIcon name="back" />
          </Link>

          <Button variant="ghost" size="icon" className={`ff-workspace-icon-button ${isAssetSidebarOpen ? "is-active" : ""}`} aria-label={`${isAssetSidebarOpen ? "Close" : "Open"} project files`} aria-pressed={isAssetSidebarOpen} onClick={() => setIsAssetSidebarOpen(!isAssetSidebarOpen)}>
            <WorkspaceIcon name="files" />
          </Button>
        </div>

        <div className="ff-workspace-title">
          <div className="ff-workspace-title-line">
            {isRenamingTitle ? (
              <form className="ff-workspace-title-rename" onSubmit={(event) => void saveTitleRename(event)}>
                <label htmlFor="workspace-project-title" className="sr-only">Project name</label>
                <input
                  ref={titleInputRef}
                  id="workspace-project-title"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  maxLength={100}
                  disabled={isTitleSaving}
                  aria-keyshortcuts="Enter Escape"
                />
                <button type="submit" disabled={isTitleSaving || !titleDraft.trim()} aria-label="Save project name" title="Save (Enter)">✓</button>
                <button type="button" disabled={isTitleSaving} onClick={cancelTitleRename} aria-label="Cancel project rename" title="Cancel (Esc)">×</button>
              </form>
            ) : (
              <div className="ff-workspace-project-crumb">
                <h1 className="ff-workspace-project-name" title={project.title}>{project.title}</h1>
                {canQuickRename ? (
                  <button type="button" onClick={startTitleRename} className="ff-workspace-title-edit" aria-label={`Rename ${project.title}`} title="Rename project">
                    <WorkspaceIcon name="edit" />
                  </button>
                ) : null}
              </div>
            )}
            <span className="ff-workspace-title-separator" aria-hidden="true">/</span>
            {isRenamingFile && activeAsset ? (
              <form className="ff-workspace-file-rename" onSubmit={(event) => void saveFileRename(event)}>
                <label htmlFor="workspace-file-name" className="sr-only">File name</label>
                <input
                  ref={fileInputRef}
                  id="workspace-file-name"
                  value={fileDraft}
                  onChange={(event) => setFileDraft(event.target.value)}
                  onKeyDown={handleFileKeyDown}
                  maxLength={255}
                  disabled={isFileSaving}
                  aria-keyshortcuts="Enter Escape"
                />
                <button type="submit" disabled={isFileSaving || !fileDraft.trim()} aria-label="Save file name" title="Save (Enter)">✓</button>
                <button type="button" disabled={isFileSaving} onClick={cancelFileRename} aria-label="Cancel file rename" title="Cancel (Esc)">×</button>
              </form>
            ) : (
              <div className="ff-workspace-file-crumb">
                <button type="button" onClick={() => setIsAssetSidebarOpen(true)} className="ff-workspace-file-name" title={activeAsset?.fileName ?? "Choose a file"} aria-label={activeAsset ? `Show ${activeAsset.fileName} in project files` : "Open project files"}>{activeAsset ? activeAsset.fileName : "Choose a file"}</button>
                {canQuickRenameFile ? (
                  <button type="button" onClick={startFileRename} className="ff-workspace-file-edit" aria-label={`Rename ${activeAsset?.fileName ?? "file"}`} title="Rename file">
                    <WorkspaceIcon name="edit" />
                  </button>
                ) : null}
              </div>
            )}
            {activeAsset ? <span className="ff-workspace-file-version">v{activeAsset.version}</span> : null}
            {isRefreshing ? <span className="ff-workspace-refresh-dot" aria-label="Refreshing workspace" /> : null}
          </div>
        </div>

        <div className="ff-workspace-presence">
          <Badge className="ff-workspace-status-badge" tone={project.isArchived ? "neutral" : statusTone[project.status]}>{project.isArchived ? "Archived" : projectStatusLabel(project.status)}</Badge>
          <ConnectionBadge status={realtimeStatus} message={realtimeMessage} compact />
          <PresenceList users={activeUsers} />
        </div>

        <div className="ff-workspace-actions">
          <Button variant="ghost" size="icon" className="ff-workspace-icon-button" onClick={toggleFocusMode} aria-pressed={focusMode} aria-label={focusMode ? "Restore both workspace panels" : "Focus the review canvas"} title={focusMode ? "Restore panels" : "Focus canvas"}>
            <WorkspaceIcon name="focus" />
          </Button>
          <Button variant={isFeedbackSidebarOpen ? "secondary" : "ghost"} size="icon" className="ff-workspace-icon-button" onClick={() => setIsFeedbackSidebarOpen(!isFeedbackSidebarOpen)} aria-pressed={isFeedbackSidebarOpen} aria-label={`${isFeedbackSidebarOpen ? "Close" : "Open"} feedback panel`}>
            <WorkspaceIcon name="feedback" />
          </Button>

          {!isOwner && project.status === "IN_REVIEW" ? (
            <Button variant="warning" size="sm" className="ff-workspace-review-direct" onClick={() => requestStatus("CHANGES_REQUESTED")} leadingIcon={<WorkspaceIcon name="revision" />}>Request changes</Button>
          ) : null}

          <div className="ff-workspace-menu-wrap">
            <Button
              ref={controlTriggerRef}
              variant={isControlsOpen ? "primary" : "secondary"}
              size="sm"
              className="ff-workspace-review-trigger"
              aria-haspopup="dialog"
              aria-expanded={isControlsOpen}
              aria-controls="review-controls-popover"
              onClick={() => setIsControlsOpen((open) => !open)}
              leadingIcon={<WorkspaceIcon name="review" />}
            >
              Review
              <span aria-hidden="true" className={`text-xs transition-transform ${isControlsOpen ? "rotate-180" : ""}`}>⌄</span>
            </Button>

            {isControlsOpen ? (
              <div ref={controlRef} id="review-controls-popover" role="dialog" aria-label="Review and project controls" className="ff-workspace-review-menu">
                <div className="ff-workspace-review-menu-head">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-white">Review flow</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{isOwner ? "Review, access, and project settings." : "Choose your review decision."}</p>
                    </div>
                    <Badge tone={project.isArchived ? "neutral" : statusTone[project.status]}>{project.isArchived ? "Archived" : projectStatusLabel(project.status)}</Badge>
                  </div>
                </div>

                <div className="ff-workspace-review-menu-body">
                  {project.isArchived && isOwner ? (
                    <WorkspaceControlRow actionRef={firstControlRef} icon={<WorkspaceIcon name="ready" />} title="Reopen project" description="Return to active work." tone="success" onClick={() => { setConfirmAction({ title: "Reopen project?", message: "The project returns to active collaboration.", confirmLabel: "Reopen project", input: { isArchived: false } }); setIsControlsOpen(false); }} />
                  ) : isOwner && (project.status === "DRAFT" || project.status === "CHANGES_REQUESTED") ? (
                    <WorkspaceControlRow actionRef={firstControlRef} icon={<WorkspaceIcon name="ready" />} title="Submit for review" description="Freeze the selected final file." tone="success" onClick={() => requestStatus("IN_REVIEW")} />
                  ) : isOwner && project.status === "IN_REVIEW" ? (
                    <WorkspaceControlRow actionRef={firstControlRef} icon={<WorkspaceIcon name="revision" />} title="Withdraw review" description="Return to draft and keep editing." tone="warning" onClick={() => requestStatus("DRAFT")} />
                  ) : !isOwner && project.status === "IN_REVIEW" ? (
                    <>
                      <WorkspaceControlRow actionRef={firstControlRef} icon={<WorkspaceIcon name="revision" />} title="Request changes" description="Send it back with a reason." tone="warning" onClick={() => requestStatus("CHANGES_REQUESTED")} />
                      {project.isApprover ? <WorkspaceControlRow icon={<WorkspaceIcon name="approve" />} title="Approve final" description="Record final approval." tone="success" onClick={() => requestStatus("APPROVED")} /> : null}
                    </>
                  ) : (
                    <div className="ff-workspace-menu-empty">No review action right now.</div>
                  )}

                  <div className="ff-workspace-menu-divider" />
                  <p className="ff-workspace-menu-label">Collaboration</p>
                  {isOwner ? <WorkspaceControlRow icon={<WorkspaceIcon name="share" />} title="Invite client" description="Send secure project access." onClick={() => { setIsInviteOpen(true); setIsControlsOpen(false); }} /> : null}
                  {isOwner ? <WorkspaceControlRow icon={<WorkspaceIcon name="members" />} title={`Members · ${project.members.length}`} description="Manage project access." onClick={() => { setIsMembersOpen(true); setIsControlsOpen(false); }} /> : null}
                  {isOwner ? <WorkspaceControlRow icon={<WorkspaceIcon name="lock" />} title={project.isDownloadUnlocked ? "Lock original downloads" : "Unlock original downloads"} description={project.isDownloadUnlocked ? "Disable original downloads." : "Allow original downloads."} onClick={() => void applyProjectUpdate({ isDownloadUnlocked: !project.isDownloadUnlocked }, project.isDownloadUnlocked ? "Original downloads locked." : "Original downloads unlocked.")} /> : null}
                  {canDownload && activeAsset?.processingStatus === "CLEAN" ? <div className="ff-workspace-menu-download"><AssetDownloadButton assetId={activeAsset.id} fileName={activeAsset.fileName} /></div> : null}

                  {signedApproval || isOwner ? (
                    <>
                      <div className="ff-workspace-menu-divider" />
                      <p className="ff-workspace-menu-label">Records</p>
                      {signedApproval ? <WorkspaceControlRow icon={<WorkspaceIcon name="certificate" />} title="Approval certificate" description="Download the signed approval record." disabled={Boolean(downloadingRecord)} onClick={() => void downloadRecord("certificate")} /> : null}
                      {isOwner ? <WorkspaceControlRow icon={<WorkspaceIcon name="audit" />} title="Export audit record" description="Download the signed project record." disabled={Boolean(downloadingRecord)} onClick={() => void downloadRecord("audit")} /> : null}
                    </>
                  ) : null}

                  {isOwner ? (
                    <>
                      <div className="ff-workspace-menu-divider" />
                      <p className="ff-workspace-menu-label">Project</p>
                      {!project.isArchived && (project.status === "DRAFT" || project.status === "CHANGES_REQUESTED") ? <WorkspaceControlRow icon={<WorkspaceIcon name="edit" />} title="Edit project details" description="Change the title or description." onClick={() => { setIsSettingsOpen(true); setIsControlsOpen(false); }} /> : null}
                      {!project.isArchived && project.status !== "IN_REVIEW" ? <WorkspaceControlRow icon={<WorkspaceIcon name="archive" />} title="Archive project" description="Make the project read-only." onClick={() => { setConfirmAction({ title: "Archive project?", message: "The project becomes read-only until the owner reopens it.", confirmLabel: "Archive project", input: { isArchived: true } }); setIsControlsOpen(false); }} /> : null}
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <ProjectFormDialog open={isSettingsOpen} project={project} onClose={() => setIsSettingsOpen(false)} onSubmit={handleSettingsSubmit} />
      <InviteProjectDialog open={isInviteOpen} projectId={projectId} projectTitle={project.title} projectVersion={project.version} onClose={() => setIsInviteOpen(false)} onInvited={async () => { await refreshWorkspace("invitation-created", true); }} />
      <MemberManagerDialog open={isMembersOpen} projectId={projectId} projectVersion={project.version} ownerName={project.owner.name} members={project.members} onClose={() => setIsMembersOpen(false)} onChanged={async () => { await refreshWorkspace("member-changed", true); }} />

      <Dialog
        open={Boolean(confirmAction)}
        onClose={() => { if (!isMutating) setConfirmAction(null); }}
        title={confirmAction?.title ?? "Confirm project change"}
        description={confirmAction?.message}
        busy={isMutating}
        role="alertdialog"
        maxWidthClassName="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAction(null)} disabled={isMutating}>Cancel</Button>
            <Button variant="primary" onClick={() => confirmAction && void applyProjectUpdate(confirmAction.input, `${confirmAction.confirmLabel} completed.`)} loading={isMutating} loadingLabel="Updating…" disabled={!confirmAction || (confirmAction.input.status === "CHANGES_REQUESTED" && revisionReason.trim().length < 3)}>
              {confirmAction?.confirmLabel}
            </Button>
          </>
        }
      >
        {confirmAction?.input.status === "CHANGES_REQUESTED" ? (
          <div>
            <label htmlFor="revision-reason" className="mb-2 block text-sm font-semibold text-zinc-200">What should change?</label>
            <textarea id="revision-reason" value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} maxLength={2_000} rows={4} placeholder="Describe the result you need from the next version." className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" />
            <p className="mt-2 text-xs text-zinc-500">At least three characters are required.</p>
          </div>
        ) : null}
        <p className="ff-workspace-confirm-note">This action is checked against the latest project version.</p>
      </Dialog>
    </>
  );
}
