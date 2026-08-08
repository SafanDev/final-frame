import type { Socket } from "socket.io-client";
import type { ProjectRole } from "@/lib/api/types";

export interface ActiveUser {
  id: string;
  name: string;
  role: ProjectRole;
  socketId: string;
  socketIds: string[];
  connectionCount: number;
}

export interface RemoteCursor {
  socketId: string;
  projectId: string;
  assetId: string;
  x: number;
  y: number;
}

export interface WorkspaceRefreshPayload {
  reason: string;
}

export interface WorkspaceErrorPayload {
  code: string;
  message: string;
}

export interface ProjectDeletedPayload {
  projectId: string;
}

export interface ProjectMemberRemovedPayload {
  projectId: string;
  userId: string;
}

export interface ClientToServerEvents {
  "join-workspace": (payload: { projectId: string } | string) => void;
  "cursor-move": (payload: {
    projectId: string;
    assetId: string;
    x: number;
    y: number;
  }) => void;
}

export interface ServerToClientEvents {
  "active-users": (users: ActiveUser[]) => void;
  "cursor-update": (payload: RemoteCursor) => void;
  "cursor-remove": (socketId: string) => void;
  "refresh-workspace": (payload: WorkspaceRefreshPayload) => void;
  "workspace-error": (payload: WorkspaceErrorPayload) => void;
  "project-deleted": (payload: ProjectDeletedPayload) => void;
  "project-member-removed": (payload: ProjectMemberRemovedPayload) => void;
}

export type FinalFrameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketAuthenticationError extends Error {
  data?: {
    code?: string;
  };
}
