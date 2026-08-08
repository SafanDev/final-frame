"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceData } from "@/contexts/WorkspaceContext";
import {
  remoteCursorClearEvent,
  remoteCursorRemoveEvent,
  remoteCursorUpdateEvent,
} from "@/lib/realtime/cursor-events";
import type { RemoteCursor } from "@/lib/realtime/contracts";

const palette = ["#34d399", "#38bdf8", "#a78bfa", "#fb7185", "#fbbf24", "#22d3ee"] as const;

interface VisibleCursor extends RemoteCursor {
  lastSeenAt: number;
}

interface RemoteCursorLayerProps {
  assetId: string;
  scale: number;
}

function colorFor(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export default function RemoteCursorLayer({ assetId, scale }: RemoteCursorLayerProps) {
  const { activeUsers } = useWorkspaceData();
  const [cursors, setCursors] = useState<Record<string, VisibleCursor>>({});
  const pendingRef = useRef<Map<string, VisibleCursor>>(new Map());
  const frameRef = useRef<number | null>(null);

  const usersBySocket = useMemo(() => {
    const entries = activeUsers.flatMap((user) => user.socketIds.map((socketId) => [socketId, user] as const));
    return new Map(entries);
  }, [activeUsers]);

  useEffect(() => {
    const flush = () => {
      frameRef.current = null;
      if (!pendingRef.current.size) return;
      const pending = new Map(pendingRef.current);
      pendingRef.current.clear();
      setCursors((current) => {
        const next = { ...current };
        for (const [socketId, cursor] of pending) next[socketId] = cursor;
        return next;
      });
    };

    const onUpdate = (event: Event) => {
      const cursor = (event as CustomEvent<RemoteCursor>).detail;
      pendingRef.current.set(cursor.socketId, { ...cursor, lastSeenAt: Date.now() });
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
    };
    const onRemove = (event: Event) => {
      const socketId = (event as CustomEvent<string>).detail;
      pendingRef.current.delete(socketId);
      setCursors((current) => {
        if (!current[socketId]) return current;
        const next = { ...current };
        delete next[socketId];
        return next;
      });
    };
    const onClear = () => {
      pendingRef.current.clear();
      setCursors({});
    };

    window.addEventListener(remoteCursorUpdateEvent, onUpdate);
    window.addEventListener(remoteCursorRemoveEvent, onRemove);
    window.addEventListener(remoteCursorClearEvent, onClear);
    const sweep = window.setInterval(() => {
      const cutoff = Date.now() - 3_500;
      setCursors((current) => {
        const entries = Object.entries(current).filter(([, cursor]) => cursor.lastSeenAt >= cutoff);
        return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
      });
    }, 1_000);

    return () => {
      window.removeEventListener(remoteCursorUpdateEvent, onUpdate);
      window.removeEventListener(remoteCursorRemoveEvent, onRemove);
      window.removeEventListener(remoteCursorClearEvent, onClear);
      window.clearInterval(sweep);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-[35] overflow-visible" aria-hidden="true">
      {Object.values(cursors).filter((cursor) => cursor.assetId === assetId).map((cursor) => {
        const user = usersBySocket.get(cursor.socketId);
        const name = user?.name ?? "Collaborator";
        const color = colorFor(user?.id ?? cursor.socketId);
        return (
          <div
            key={cursor.socketId}
            className="absolute left-0 top-0 will-change-transform transition-[left,top] duration-[45ms] ease-linear"
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%`, transform: `scale(${1 / Math.max(scale, 0.01)})`, transformOrigin: "top left" }}
          >
            <svg width="20" height="25" viewBox="0 0 22 27" fill="none" className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]">
              <path d="M1 1L20 13.1L11.2 15.2L7.1 25L1 1Z" fill={color} stroke="#050505" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className="absolute left-4 top-4 max-w-36 truncate rounded-md px-2 py-1 text-xs font-bold text-zinc-950" style={{ backgroundColor: color }}>
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
