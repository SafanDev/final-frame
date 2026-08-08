"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import type { ProjectListItem } from "@/lib/api/types";
import { getUserFacingErrorMessage, normalizeApiError, type ApiError } from "@/lib/api/errors";
import Dialog from "@/components/ui/Dialog";
import InlineAlert from "@/components/ui/InlineAlert";

export interface ProjectFormValues {
  title: string;
  description?: string;
}

interface ProjectFormDialogProps {
  open: boolean;
  project?: ProjectListItem | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
}

function fieldMessage(error: ApiError | null, field: string): string | null {
  return error?.fields.find((item) => item.path === field)?.message ?? null;
}

export default function ProjectFormDialog({
  open,
  project,
  returnFocusRef,
  onClose,
  onSubmit,
}: ProjectFormDialogProps) {
  const isEditing = Boolean(project);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(project?.title ?? "");
    setDescription(project?.description ?? "");
    setSubmitError(null);
  }, [open, project]);

  const normalizedTitle = title.trim();
  const normalizedDescription = description.trim();
  const hasChanges = !isEditing ||
    normalizedTitle !== project?.title ||
    normalizedDescription !== (project?.description ?? "");
  const titleError = fieldMessage(submitError, "title");
  const descriptionError = fieldMessage(submitError, "description");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !normalizedTitle || normalizedTitle.length > 100) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmit({
        title: normalizedTitle,
        ...(normalizedDescription ? { description: normalizedDescription } : {}),
      });
      onClose();
    } catch (error) {
      setSubmitError(normalizeApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit project" : "Create a new project"}
      description={
        isEditing
          ? "Keep the title and description clear so every collaborator understands the review goal."
          : "Give the workspace a clear name and an optional description. You can upload the first asset after creation."
      }
      busy={isSubmitting}
      initialFocusRef={titleRef}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 px-5 font-bold text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="project-form"
            disabled={
              isSubmitting ||
              !normalizedTitle ||
              normalizedTitle.length > 100 ||
              description.length > 1_000 ||
              !hasChanges
            }
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-400 px-5 font-bold text-[#04110d] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Saving…" : isEditing ? "Save changes" : "Create project"}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        {submitError ? (
          <InlineAlert
            tone="error"
            title={isEditing ? "Project could not be updated" : "Project could not be created"}
            requestId={submitError.requestId}
          >
            {getUserFacingErrorMessage(submitError)}
          </InlineAlert>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <label htmlFor="project-title" className="text-sm font-semibold text-zinc-200">
              Project title
            </label>
            <span className={`text-xs ${title.length > 100 ? "text-rose-300" : "text-zinc-500"}`}>
              {title.length}/100
            </span>
          </div>
          <input
            ref={titleRef}
            id="project-title"
            name="title"
            type="text"
            autoComplete="off"
            required
            minLength={1}
            maxLength={100}
            value={title}
            disabled={isSubmitting}
            aria-invalid={Boolean(titleError) || title.length > 100}
            aria-describedby={titleError ? "project-title-error" : undefined}
            onChange={(event) => setTitle(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-white/10 bg-[#050505] px-4 text-base text-white shadow-inner transition placeholder:text-zinc-600 hover:border-white/20 focus:border-emerald-400 disabled:opacity-60"
            placeholder="Example: Summer campaign review"
          />
          {titleError ? (
            <p id="project-title-error" className="mt-2 text-sm text-rose-300">
              {titleError}
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <label htmlFor="project-description" className="text-sm font-semibold text-zinc-200">
              Description <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <span className={`text-xs ${description.length > 1_000 ? "text-rose-300" : "text-zinc-500"}`}>
              {description.length}/1000
            </span>
          </div>
          <textarea
            id="project-description"
            name="description"
            rows={5}
            maxLength={1_000}
            value={description}
            disabled={isSubmitting}
            aria-invalid={Boolean(descriptionError) || description.length > 1_000}
            aria-describedby={descriptionError ? "project-description-error" : "project-description-help"}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full resize-y rounded-xl border border-white/10 bg-[#050505] px-4 py-3 text-base leading-7 text-white shadow-inner transition placeholder:text-zinc-600 hover:border-white/20 focus:border-emerald-400 disabled:opacity-60"
            placeholder="Explain the deliverable, review goal, deadline or decision needed."
          />
          {descriptionError ? (
            <p id="project-description-error" className="mt-2 text-sm text-rose-300">
              {descriptionError}
            </p>
          ) : (
            <p id="project-description-help" className="mt-2 text-xs leading-5 text-zinc-500">
              Avoid sensitive information that is not needed for the review.
            </p>
          )}
        </div>
      </form>
    </Dialog>
  );
}
