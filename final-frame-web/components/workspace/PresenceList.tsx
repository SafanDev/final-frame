"use client";

import { useEffect, useRef, useState } from "react";
import type { ActiveUser } from "@/lib/realtime/contracts";

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

export default function PresenceList({ users }: { users: ActiveUser[] }) {
  const collaborators = Array.from(new Map(users.map((user) => [user.id, user])).values());
  const visible = collaborators.slice(0, 4);
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

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${collaborators.length} active collaborator${collaborators.length === 1 ? "" : "s"}. Show details.`}
        className="flex min-h-10 items-center rounded-xl px-1.5 outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-300"
      >
        <span className="flex -space-x-2" aria-hidden="true">
          {visible.map((user) => (
            <span key={user.id} title={`${user.name} · ${user.role === "DESIGNER" ? "Designer" : "Client"}`} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0d0e10] text-xs font-black ${user.role === "DESIGNER" ? "bg-sky-500 text-white" : "bg-emerald-400 text-zinc-950"}`}>
              {initials(user.name)}
            </span>
          ))}
          {remaining > 0 ? <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0d0e10] bg-zinc-800 text-xs font-bold text-zinc-200">+{remaining}</span> : null}
        </span>
        <span className="ml-2 hidden text-xs text-zinc-500 xl:inline">{collaborators.length > 0 ? `${collaborators.length} active` : "Only you"}</span>
      </button>

      {open ? (
        <div role="region" aria-label="Active collaborators" className="absolute right-0 top-full z-[110] mt-2 w-72 rounded-xl border border-white/12 bg-[#111214] p-2 shadow-[0_16px_45px_rgba(0,0,0,0.48)]">
          <div className="flex items-center justify-between px-2 py-1.5"><p className="text-sm font-bold text-white">Active now</p><span className="text-xs text-zinc-500">{collaborators.length}</span></div>
          {collaborators.length ? (
            <ul className="mt-1 space-y-1">
              {collaborators.map((user) => (
                <li key={user.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black ${user.role === "DESIGNER" ? "bg-sky-500 text-white" : "bg-emerald-400 text-zinc-950"}`}>{initials(user.name)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{user.name}</span><span className="block text-xs text-zinc-500">{user.role === "DESIGNER" ? "Designer" : "Client"} · {user.connectionCount > 1 ? `${user.connectionCount} sessions` : "connected"}</span></span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-label="Online" />
                </li>
              ))}
            </ul>
          ) : <p className="px-2 py-3 text-sm text-zinc-500">No other collaborators are connected.</p>}
        </div>
      ) : null}
    </div>
  );
}
