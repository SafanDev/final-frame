import type { RemoteCursor } from "@/lib/realtime/contracts";

export const remoteCursorUpdateEvent = "finalframe:remote-cursor-update";
export const remoteCursorRemoveEvent = "finalframe:remote-cursor-remove";
export const remoteCursorClearEvent = "finalframe:remote-cursor-clear";

export function publishRemoteCursor(cursor: RemoteCursor): void {
  window.dispatchEvent(new CustomEvent<RemoteCursor>(remoteCursorUpdateEvent, { detail: cursor }));
}

export function removeRemoteCursor(socketId: string): void {
  window.dispatchEvent(new CustomEvent<string>(remoteCursorRemoveEvent, { detail: socketId }));
}

export function clearRemoteCursors(): void {
  window.dispatchEvent(new Event(remoteCursorClearEvent));
}
