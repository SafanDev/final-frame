"use client";

import { useEffect, useRef, useState } from "react";
import Dialog from "@/components/ui/Dialog";
import InlineAlert from "@/components/ui/InlineAlert";
import { removeProjectMember, setProjectMemberApprover } from "@/lib/api/projects";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import type { ProjectMember } from "@/lib/api/types";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { formatShortDate } from "@/lib/utils/format";

interface MemberManagerDialogProps {
  open: boolean;
  projectId: string;
  projectVersion: number;
  ownerName: string;
  members: ProjectMember[];
  onClose: () => void;
  onChanged: (projectVersion: number) => Promise<void> | void;
}

export default function MemberManagerDialog({
  open,
  projectId,
  projectVersion,
  ownerName,
  members,
  onClose,
  onChanged,
}: MemberManagerDialogProps) {
  const preferences = useUserPreferences();
  const latestProjectVersionRef = useRef(projectVersion);
  const [visibleMembers, setVisibleMembers] = useState(members);
  const [pendingMember, setPendingMember] = useState<ProjectMember | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(projectVersion);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  useEffect(() => {
    latestProjectVersionRef.current = projectVersion;
  }, [projectVersion]);

  useEffect(() => {
    if (!open) return;
    setCurrentVersion(latestProjectVersionRef.current);
    setVisibleMembers(members);
  }, [members, open]);

  const isBusy = busyMemberId !== null;

  function close() {
    setPendingMember(null);
    setError(null);
    onClose();
  }

  function confirmRemoval() {
    if (!pendingMember || isBusy) return;
    const target = pendingMember;
    const previousMembers = visibleMembers;
    const expectedVersion = currentVersion;
    setBusyMemberId(target.userId);
    setPendingMember(null);
    setError(null);
    setVisibleMembers((current) => current.filter((member) => member.userId !== target.userId));

    void removeProjectMember(projectId, target.userId, expectedVersion)
      .then((result) => {
        const nextVersion = result.projectVersion ?? expectedVersion + 1;
        setCurrentVersion(nextVersion);
        void Promise.resolve(onChanged(nextVersion));
      })
      .catch((caught) => {
        setVisibleMembers(previousMembers);
        const normalized = normalizeApiError(caught);
        setError({
          message: getUserFacingErrorMessage(caught, "The Client could not be removed."),
          requestId: normalized.requestId,
        });
      })
      .finally(() => setBusyMemberId(null));
  }

  function toggleApprover(member: ProjectMember) {
    if (isBusy) return;
    const previous = member.isApprover;
    const next = !previous;
    const expectedVersion = currentVersion;
    setBusyMemberId(member.userId);
    setError(null);
    setVisibleMembers((current) => current.map((candidate) => candidate.userId === member.userId
      ? { ...candidate, isApprover: next }
      : candidate));

    void setProjectMemberApprover(projectId, member.userId, next, expectedVersion)
      .then((result) => {
        setCurrentVersion(result.projectVersion);
        setVisibleMembers((current) => current.map((candidate) => candidate.userId === member.userId
          ? { ...candidate, isApprover: result.isApprover }
          : candidate));
        void Promise.resolve(onChanged(result.projectVersion));
      })
      .catch((caught) => {
        setVisibleMembers((current) => current.map((candidate) => candidate.userId === member.userId
          ? { ...candidate, isApprover: previous }
          : candidate));
        const normalized = normalizeApiError(caught);
        setError({
          message: getUserFacingErrorMessage(caught, "The approval role could not be changed."),
          requestId: normalized.requestId,
        });
      })
      .finally(() => setBusyMemberId(null));
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Workspace access"
      description="Manage Client access and choose who may give final approval. Access changes take effect immediately."
      maxWidthClassName="max-w-2xl"
      footer={<button type="button" onClick={close} className="min-h-11 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-300 hover:bg-white/5">Done</button>}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-4 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-black text-white">{ownerName.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0"><p className="truncate font-bold text-white">{ownerName}</p><p className="mt-1 text-xs font-semibold text-sky-300">Designer · Project owner</p></div>
        </div>

        {visibleMembers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-7 text-center">
            <p className="font-semibold text-zinc-300">No Clients have joined</p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Use Share to invite a Client by email.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleMembers.map((member) => (
              <li key={member.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-xs font-black text-zinc-950">{member.user.name.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-white">{member.user.name}</p>
                      {member.isApprover ? <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-300">Approver</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">Client · Joined {formatShortDate(member.joinedAt, preferences)}</p>
                  </div>
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <button type="button" onClick={() => toggleApprover(member)} disabled={isBusy} className="min-h-10 flex-1 rounded-lg border border-white/10 px-3 text-xs font-bold text-zinc-200 hover:bg-white/5 disabled:opacity-50 sm:flex-none">{member.isApprover ? "Remove approval" : "Make approver"}</button>
                  <button type="button" onClick={() => { setPendingMember(member); setError(null); }} disabled={isBusy} className="min-h-10 flex-1 rounded-lg border border-rose-400/20 px-3 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 sm:flex-none">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingMember ? (
        <div className="mt-5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-4" role="alertdialog" aria-labelledby="remove-member-title">
          <p id="remove-member-title" className="font-bold text-rose-100">Remove {pendingMember.user.name}?</p>
          <p className="mt-2 text-sm leading-6 text-rose-100/80">Their access and live connection end immediately. Existing feedback and activity remain in the audit record.</p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setPendingMember(null)} className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/5">Cancel</button>
            <button type="button" onClick={confirmRemoval} className="min-h-10 rounded-lg bg-rose-500 px-4 text-xs font-bold text-white hover:bg-rose-400">Remove access</button>
          </div>
        </div>
      ) : null}

      {error ? <InlineAlert tone="error" title="Access change failed" requestId={error.requestId} className="mt-5">{error.message}</InlineAlert> : null}
    </Dialog>
  );
}
