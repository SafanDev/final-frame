"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { ProjectListItem } from "@/lib/api/types";
import { formatRelativeDate, formatShortDate, statusLabel } from "@/lib/utils/format";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";

interface ProjectCardProps {
  project: ProjectListItem;
  currentUserId: string;
  onEdit: (project: ProjectListItem) => void;
  onToggleArchive: (project: ProjectListItem) => void;
  onDelete: (project: ProjectListItem) => void;
}

const statusTone: Record<ProjectListItem["status"], BadgeTone> = {
  DRAFT: "neutral",
  IN_REVIEW: "info",
  CHANGES_REQUESTED: "warning",
  APPROVED: "success",
};

function Icon({ name }: { name: "files" | "people" | "open" | "manage" }) {
  const paths = {
    files: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4.6" /></>,
    open: <><path d="M5 12h13M14 8l4 4-4 4" /></>,
    manage: <><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function ProjectCard({ project, currentUserId, onEdit, onToggleArchive, onDelete }: ProjectCardProps) {
  const preferences = useUserPreferences();
  const isOwner = project.ownerId === currentUserId;
  const canEditDetails = !project.isArchived && (project.status === "DRAFT" || project.status === "CHANGES_REQUESTED");
  const canArchive = project.status !== "IN_REVIEW";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setIsMenuOpen(false);
    };
    const closeEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [isMenuOpen]);

  function focusMenuItem(direction: 1 | -1) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (!items.length) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = activeIndex < 0 ? (direction === 1 ? 0 : items.length - 1) : (activeIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      (event.key === "Home" ? items[0] : items.at(-1))?.focus();
    }
  }

  function invoke(action: () => void) {
    setIsMenuOpen(false);
    action();
  }

  return (
    <article className="ff-project-card group relative flex min-h-[18rem] flex-col overflow-visible p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone[project.status]}>{statusLabel(project.status)}</Badge>
          {project.isArchived ? <Badge>Archived</Badge> : null}
          <span className="text-xs font-semibold text-zinc-500">{isOwner ? "Owner" : "Shared"}</span>
        </div>
      </div>

      <div className="mt-5 flex-1">
        <h2 className="text-xl font-black tracking-[-0.03em] text-white">
          <Link href={`/project/${project.id}`} className="rounded decoration-emerald-300 underline-offset-4 hover:text-emerald-200 hover:underline">
            {project.title}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{project.description || "Files, feedback and the next decision in one place."}</p>
      </div>

      <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5"><Icon name="files" /><dt className="sr-only">Assets</dt><dd>{project._count.assets} files</dd></div>
        <div className="flex items-center gap-1.5"><Icon name="people" /><dt className="sr-only">Collaborators</dt><dd>{project._count.members} clients</dd></div>
        <div className="ml-auto" title={formatShortDate(project.updatedAt, preferences)}>Updated {formatRelativeDate(project.updatedAt, preferences)}</div>
      </dl>

      <div className="mt-4 flex items-center gap-2">
        <Link href={`/project/${project.id}`} className="ff-project-open inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200">
          Open review <Icon name="open" />
        </Link>

        {isOwner ? (
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-controls={menuId}
              aria-label={`Manage ${project.title}`}
              onClick={() => setIsMenuOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                setIsMenuOpen(true);
                window.requestAnimationFrame(() => focusMenuItem(event.key === "ArrowDown" ? 1 : -1));
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
            >
              <Icon name="manage" />
            </button>
            {isMenuOpen ? (
              <div ref={menuRef} id={menuId} role="menu" aria-label={`Manage ${project.title}`} onKeyDown={handleMenuKeyDown} className="absolute bottom-[calc(100%+0.5rem)] right-0 z-40 w-56 rounded-lg border border-white/12 bg-[#151618] p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.5)]">
                <button type="button" role="menuitem" disabled={!canEditDetails} onClick={() => invoke(() => onEdit(project))} className="flex min-h-10 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:text-zinc-600">Edit details</button>
                <button type="button" role="menuitem" disabled={!canArchive} onClick={() => invoke(() => onToggleArchive(project))} className="flex min-h-10 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:text-zinc-600">{project.isArchived ? "Reopen project" : "Archive project"}</button>
                <div className="my-1 h-px bg-white/10" role="separator" />
                <button type="button" role="menuitem" onClick={() => invoke(() => onDelete(project))} className="flex min-h-10 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-rose-300 hover:bg-rose-400/10 disabled:text-zinc-600">Delete project</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
