"use client";

import { useEffect, useRef, useState } from "react";
import type { ActiveUser } from "@/lib/realtime/contracts";

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

export default function PresenceList({ users }: { users: ActiveUser[] }) {
  const collaborators = Array.from(new Map(users.map((user) => [user.id, user])).values());
  const visible = collaborators.slice(0, 3);
  const remaining = Math.max(0, collaborators.length - visible.length);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  if (collaborators.length === 0) return null;

  return (
    <div ref={rootRef} className="ff-presence-root">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${collaborators.length} active collaborator${collaborators.length === 1 ? "" : "s"}. Show details.`}
        className="ff-presence-trigger"
      >
        <span className="ff-presence-stack" aria-hidden="true">
          {visible.map((user) => (
            <span key={user.id} title={user.name} className="ff-presence-avatar">
              {initials(user.name)}
            </span>
          ))}
          {remaining > 0 ? <span className="ff-presence-avatar ff-presence-more">+{remaining}</span> : null}
        </span>
        {collaborators.length > 1 ? <span className="ff-presence-count">{collaborators.length}</span> : null}
      </button>

      {open ? (
        <div role="region" aria-label="Active collaborators" className="ff-presence-popover">
          <div className="ff-presence-popover-head"><p>Active now</p><span>{collaborators.length}</span></div>
          <ul>
            {collaborators.map((user) => (
              <li key={user.id}>
                <span className="ff-presence-person-avatar">{initials(user.name)}</span>
                <span className="ff-presence-person-copy"><strong>{user.name}</strong><small>{user.role === "DESIGNER" ? "Owner" : "Reviewer"}{user.connectionCount > 1 ? ` · ${user.connectionCount} sessions` : ""}</small></span>
                <span className="ff-presence-online" aria-label="Online" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
