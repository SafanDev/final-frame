"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ProjectListItem } from "@/lib/api/types";

interface ProjectActionsMenuProps {
  project: ProjectListItem;
  canEditDetails: boolean;
  canArchive: boolean;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

export default function ProjectActionsMenu({
  project,
  canEditDetails,
  canArchive,
  onEdit,
  onToggleArchive,
  onDelete,
}: ProjectActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const closeEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  function focusMenuItem(direction: 1 | -1) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
    );
    if (!items.length) return;

    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = activeIndex < 0
      ? direction === 1 ? 0 : items.length - 1
      : (activeIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
      );
      (event.key === "Home" ? items[0] : items.at(-1))?.focus();
    }
  }

  function invoke(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="ff-project-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Manage ${project.title}`}
        className="ff-project-menu-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
          window.requestAnimationFrame(() => focusMenuItem(event.key === "ArrowDown" ? 1 : -1));
        }}
      >
        <MoreIcon />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Manage ${project.title}`}
          onKeyDown={handleMenuKeyDown}
          className="ff-project-menu"
        >
          <button type="button" role="menuitem" disabled={!canEditDetails} onClick={() => invoke(onEdit)}>
            Edit details
          </button>
          <button type="button" role="menuitem" disabled={!canArchive} onClick={() => invoke(onToggleArchive)}>
            {project.isArchived ? "Reopen project" : "Archive project"}
          </button>
          <div className="ff-project-menu-separator" role="separator" />
          <button type="button" role="menuitem" className="is-danger" onClick={() => invoke(onDelete)}>
            Delete project
          </button>
        </div>
      ) : null}
    </div>
  );
}
