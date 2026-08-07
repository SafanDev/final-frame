"use client";

import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { toast } from "sonner";
import AssetDownloadButton from "@/components/assets/AssetDownloadButton";
import ProjectFormDialog, { type ProjectFormValues } from "@/components/dashboard/ProjectFormDialog";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import ConnectionBadge from "@/components/workspace/ConnectionBadge";
import InviteProjectDialog from "@/components/workspace/InviteProjectDialog";
import MemberManagerDialog from "@/components/workspace/MemberManagerDialog";
import PresenceList from "@/components/workspace/PresenceList";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
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

interface ControlRowProps {
  title: string;
  description?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "success" | "warning" | "danger";
  actionRef?: Ref<HTMLButtonElement>;
}

function ControlRow({ title, description, icon, onClick, disabled, tone = "neutral", actionRef }: ControlRowProps) {
  const toneClass = tone === "success"
    ? "text-emerald-100 hover:bg-emerald-400/10"
    : tone === "warning"
      ? "text-amber-100 hover:bg-amber-400/10"
      : tone === "danger"
        ? "text-rose-200 hover:bg-rose-400/10"
        : "text-zinc-100 hover:bg-white/[0.05]";
  return (
    <button
      ref={actionRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] text-zinc-400 transition group-hover:border-white/20 group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        {description ? <span className="mt-0.5 block text-xs leading-4 text-zinc-500">{description}</span> : null}
      </span>
      <span aria-hidden="true" className="text-zinc-600">→</span>
    </button>
  );
}

function Icon({ name }: { name: "back" | "files" | "feedback" | "review" | "focus" | "share" | "members" | "edit" | "archive" | "lock" | "ready" | "approve" | "revision" | "certificate" | "audit" }) {
  const paths: Record<typeof name, ReactNode> = {
    back: <path d="m15 18-6-6 6-6" />,
    files: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
    feedback: <><path d="M4 5h16v12H8l-4 3z" /><path d="M8 9h8M8 13h5" /></>,
    review: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    focus: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></>,
    share: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
    members: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4.6" /></>,
    edit: <><path d="m4 20 4.5-1 9.8-9.8-3.5-3.5L5 15.5z" /><path d="m13.8 6.7 3.5 3.5" /></>,
    archive: <><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    ready: <><path d="M4 12h13M13 8l4 4-4 4" /><path d="M20 5v14" /></>,
    approve: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 8" /></>,
    revision: <><path d="M4 7h11a5 5 0 0 1 0 10H8" /><path d="m8 13-4 4 4 4" /></>,
    certificate: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6" /><path d="m10 17 2-1 2 1v4h-4z" /></>,
    audit: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.125rem] w-[1.125rem]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function projectStatusLabel(status: ProjectStatus): string {
  if (status === "DRAFT") return "Draft";
  if (status === "CHANGES_REQUESTED") return "Changes requested";
  if (status === "APPROVED") return "Approved";
  return "In review";
}

export default function WorkspaceHeader() {
  const {
    projectId,
    project,
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [downloadingRecord, setDownloadingRecord] = useState<"certificate" | "audit" | null>(null);

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

  if (!project) return null;
  const currentProject = project;
  const canDownload = Boolean(isOwner || project.isDownloadUnlocked);
  const focusMode = !isAssetSidebarOpen && !isFeedbackSidebarOpen;
  const signedApproval = project.latestSignedApproval;

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
      } else {
        const projectFields = {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
          ...(input.isDownloadUnlocked !== undefined
            ? { isDownloadUnlocked: input.isDownloadUnlocked }
            : {}),
        };
        await updateProject(projectId, {
          ...projectFields,
          expectedVersion: currentProject.version,
        });
      }
      await refreshWorkspace("project-updated", true);
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
            : "Submit for Client review?",
      message: approved
        ? "This records final Client approval for the selected file."
        : revision
          ? "Explain the changes the Designer should make before resubmitting."
          : withdrawing
            ? "The Designer can edit files again and submit a new review when ready."
            : "The selected final file will be frozen while Clients review it.",
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
      <header className="ff-safe-top ff-workspace-header relative z-50 flex min-h-14 shrink-0 items-center gap-1 px-2 sm:gap-1.5 sm:px-3">
        <Link href="/app" aria-label="Return to project dashboard" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
          <Icon name="back" />
        </Link>

        <Button variant={isAssetSidebarOpen ? "secondary" : "ghost"} size="icon" className="h-10 w-10 rounded-lg" aria-label={`${isAssetSidebarOpen ? "Close" : "Open"} project files`} aria-pressed={isAssetSidebarOpen} onClick={() => setIsAssetSidebarOpen(!isAssetSidebarOpen)}>
          <Icon name="files" />
        </Button>

        <div className="min-w-0 flex-1 px-1.5 sm:px-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-bold tracking-[-0.01em] text-white sm:text-[0.95rem]">{project.title}</h1>
            {isRefreshing ? <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-300" aria-label="Refreshing workspace" /> : null}
          </div>
          <p className="mt-0.5 hidden truncate text-xs text-zinc-500 md:block">{activeAsset ? `${activeAsset.fileName} · v${activeAsset.version}` : "Choose a file to review"}</p>
        </div>

        <div className="hidden items-center gap-2 xl:flex">
          <ConnectionBadge status={realtimeStatus} message={realtimeMessage} compact />
          <PresenceList users={activeUsers} />
          <Badge tone={project.isArchived ? "neutral" : statusTone[project.status]}>{project.isArchived ? "Archived" : projectStatusLabel(project.status)}</Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg" onClick={toggleFocusMode} aria-pressed={focusMode} aria-label={focusMode ? "Restore both workspace panels" : "Focus the review canvas"} title={focusMode ? "Restore panels" : "Focus canvas"}>
            <Icon name="focus" />
          </Button>
          <Button variant={isFeedbackSidebarOpen ? "secondary" : "ghost"} size="icon" className="h-10 w-10 rounded-lg" onClick={() => setIsFeedbackSidebarOpen(!isFeedbackSidebarOpen)} aria-pressed={isFeedbackSidebarOpen} aria-label={`${isFeedbackSidebarOpen ? "Close" : "Open"} feedback panel`}>
            <Icon name="feedback" />
          </Button>

          {!isOwner && project.status === "IN_REVIEW" ? (
            <Button variant="warning" size="sm" className="hidden lg:inline-flex" onClick={() => requestStatus("CHANGES_REQUESTED")} leadingIcon={<Icon name="revision" />}>Request changes</Button>
          ) : null}

          <div className="relative">
            <Button
              ref={controlTriggerRef}
              variant={isControlsOpen ? "primary" : "secondary"}
              size="sm"
              aria-haspopup="dialog"
              aria-expanded={isControlsOpen}
              aria-controls="review-controls-popover"
              onClick={() => setIsControlsOpen((open) => !open)}
              leadingIcon={<Icon name="review" />}
            >
              Review
              <span aria-hidden="true" className={`text-xs transition-transform ${isControlsOpen ? "rotate-180" : ""}`}>⌄</span>
            </Button>

            {isControlsOpen ? (
              <div ref={controlRef} id="review-controls-popover" role="dialog" aria-label="Review and project controls" className="absolute right-0 top-[calc(100%+0.5rem)] z-[90] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-white/12 bg-[#121315] shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-white">Review flow</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{isOwner ? "Move the work forward and manage access." : "Choose the decision that matches your review."}</p>
                    </div>
                    <Badge tone={project.isArchived ? "neutral" : statusTone[project.status]}>{project.isArchived ? "Archived" : projectStatusLabel(project.status)}</Badge>
                  </div>
                </div>

                <div className="max-h-[min(34rem,75vh)] overflow-y-auto p-2">
                  {project.isArchived && isOwner ? (
                    <ControlRow actionRef={firstControlRef} icon={<Icon name="ready" />} title="Reopen project" description="Return the workspace to its previous review state." tone="success" onClick={() => { setConfirmAction({ title: "Reopen project?", message: "The project returns to active collaboration.", confirmLabel: "Reopen project", input: { isArchived: false } }); setIsControlsOpen(false); }} />
                  ) : isOwner && (project.status === "DRAFT" || project.status === "CHANGES_REQUESTED") ? (
                    <ControlRow actionRef={firstControlRef} icon={<Icon name="ready" />} title="Submit for Client review" description="Freeze the selected final file and ask Clients for a decision." tone="success" onClick={() => requestStatus("IN_REVIEW")} />
                  ) : isOwner && project.status === "IN_REVIEW" ? (
                    <ControlRow actionRef={firstControlRef} icon={<Icon name="revision" />} title="Withdraw review" description="Return to Draft so files can be edited again." tone="warning" onClick={() => requestStatus("DRAFT")} />
                  ) : !isOwner && project.status === "IN_REVIEW" ? (
                    <>
                      <ControlRow actionRef={firstControlRef} icon={<Icon name="revision" />} title="Request changes" description="Explain what the Designer should update." tone="warning" onClick={() => requestStatus("CHANGES_REQUESTED")} />
                      {project.isApprover ? <ControlRow icon={<Icon name="approve" />} title="Give final approval" description="Approve the selected final file." tone="success" onClick={() => requestStatus("APPROVED")} /> : null}
                    </>
                  ) : (
                    <div className="rounded-lg px-3 py-3 text-sm text-zinc-400">No review decision is available in this state.</div>
                  )}

                  <div className="my-2 h-px bg-white/10" />
                  <p className="px-2 pb-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-zinc-600">Collaboration</p>
                  {isOwner ? <ControlRow icon={<Icon name="share" />} title="Invite a Client" description="Create a one-time invite for a client." onClick={() => { setIsInviteOpen(true); setIsControlsOpen(false); }} /> : null}
                  {isOwner ? <ControlRow icon={<Icon name="members" />} title={`Members · ${project.members.length}`} description="Review and remove project access." onClick={() => { setIsMembersOpen(true); setIsControlsOpen(false); }} /> : null}
                  {isOwner ? <ControlRow icon={<Icon name="lock" />} title={project.isDownloadUnlocked ? "Lock original downloads" : "Unlock original downloads"} description={project.isDownloadUnlocked ? "Clients keep previews but lose original downloads." : "Allow clients to download approved originals."} onClick={() => void applyProjectUpdate({ isDownloadUnlocked: !project.isDownloadUnlocked }, project.isDownloadUnlocked ? "Original downloads locked." : "Original downloads unlocked.")} /> : null}
                  {canDownload && activeAsset?.processingStatus === "CLEAN" ? <div className="px-2 py-1"><AssetDownloadButton assetId={activeAsset.id} fileName={activeAsset.fileName} /></div> : null}

                  {signedApproval || isOwner ? (
                    <>
                      <div className="my-2 h-px bg-white/10" />
                      <p className="px-2 pb-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-zinc-600">Records</p>
                      {signedApproval ? <ControlRow icon={<Icon name="certificate" />} title="Approval certificate" description="Download the signed final-approval record." disabled={Boolean(downloadingRecord)} onClick={() => void downloadRecord("certificate")} /> : null}
                      {isOwner ? <ControlRow icon={<Icon name="audit" />} title="Export audit record" description="Download project activity, decisions, files and feedback as signed NDJSON." disabled={Boolean(downloadingRecord)} onClick={() => void downloadRecord("audit")} /> : null}
                    </>
                  ) : null}

                  {isOwner ? (
                    <>
                      <div className="my-2 h-px bg-white/10" />
                      <p className="px-2 pb-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-zinc-600">Project</p>
                      {!project.isArchived && (project.status === "DRAFT" || project.status === "CHANGES_REQUESTED") ? <ControlRow icon={<Icon name="edit" />} title="Edit project details" description="Update the title and short description." onClick={() => { setIsSettingsOpen(true); setIsControlsOpen(false); }} /> : null}
                      {!project.isArchived && project.status !== "IN_REVIEW" ? <ControlRow icon={<Icon name="archive" />} title="Archive project" description="Pause work and make the workspace read-only." onClick={() => { setConfirmAction({ title: "Archive project?", message: "The project becomes read-only until the owner reopens it.", confirmLabel: "Archive project", input: { isArchived: true } }); setIsControlsOpen(false); }} /> : null}
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
        <p className="mt-4 text-sm leading-6 text-zinc-400">FinalFrame checks the project version before applying this change, so another collaborator cannot silently overwrite your decision.</p>
      </Dialog>
    </>
  );
}
