"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProjectListItem } from "@/lib/api/types";
import { getUserFacingErrorMessage, normalizeApiError, type ApiError } from "@/lib/api/errors";
import Dialog from "@/components/ui/Dialog";
import InlineAlert from "@/components/ui/InlineAlert";

interface DeleteProjectDialogProps {
  project: ProjectListItem | null;
  onClose: () => void;
  onConfirm: (project: ProjectListItem) => Promise<void>;
}

export default function DeleteProjectDialog({
  project,
  onClose,
  onConfirm,
}: DeleteProjectDialogProps) {
  const confirmationRef = useRef<HTMLInputElement | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!project) return;
    setConfirmation("");
    setDeleteError(null);
  }, [project]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || confirmation !== project.title || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onConfirm(project);
      onClose();
    } catch (error) {
      setDeleteError(normalizeApiError(error));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      open={Boolean(project)}
      onClose={onClose}
      title="Delete project permanently?"
      description="This removes the project, its workspace records and all associated versions and feedback. Cloud objects are queued for secure cleanup. This action cannot be undone."
      role="alertdialog"
      busy={isDeleting}
      initialFocusRef={confirmationRef}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 px-5 font-bold text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Keep project
          </button>
          <button
            type="submit"
            form="delete-project-form"
            disabled={!project || confirmation !== project.title || isDeleting}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-500 px-5 font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Delete permanently"}
          </button>
        </>
      }
    >
      <form id="delete-project-form" onSubmit={handleSubmit} className="space-y-5">
        {deleteError ? (
          <InlineAlert tone="error" title="Project could not be deleted" requestId={deleteError.requestId}>
            {getUserFacingErrorMessage(deleteError)}
          </InlineAlert>
        ) : null}

        <InlineAlert tone="warning" title="Approved projects are protected">
          An approved project cannot be deleted. Reopening approved work is intentionally blocked by the backend to preserve its final decision record.
        </InlineAlert>

        <div>
          <label htmlFor="delete-project-confirmation" className="block text-sm font-semibold text-zinc-200">
            Type <span className="select-all font-bold text-white">{project?.title}</span> to confirm
          </label>
          <input
            ref={confirmationRef}
            id="delete-project-confirmation"
            name="confirmation"
            type="text"
            autoComplete="off"
            value={confirmation}
            disabled={isDeleting}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl border border-rose-400/25 bg-[#050505] px-4 text-base text-white shadow-inner transition placeholder:text-zinc-600 hover:border-rose-300/40 focus:border-rose-300 disabled:opacity-60"
          />
        </div>
      </form>
    </Dialog>
  );
}
