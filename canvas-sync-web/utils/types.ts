// ============================================================================
// GLOBAL TYPE DEFINITIONS
// ============================================================================
// Location: utils/types.ts
// Purpose: Eliminates 'any' types across the frontend. Ensures strict data 
// structure adherence between the Prisma backend and React components.
// ============================================================================

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface CommentAuthor {
  name: string;
  email: string;
}

export interface ProjectComment {
  id: string;
  text: string;
  xPos: number;
  yPos: number;
  isResolved: boolean;
  createdAt: string;
  authorId: string;
  assetId: string;
  author?: CommentAuthor;
}

export interface ProjectAsset {
  id: string;
  fileUrl: string;
  fileName: string;
  version: number;
  createdAt: string;
  projectId: string;
  comments: ProjectComment[];
}

export interface ActivityLog {
  id: string;
  projectId: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  joinedAt: string;
}

export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED';
  inviteToken: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  isDownloadUnlocked: boolean;
  ownerId: string;
  assets: ProjectAsset[];
  members: ProjectMember[];
  activityLogs: ActivityLog[];
  owner?: User;
}

export interface ActiveCursor {
  socketId: string;
  projectId: string;
  x: number;
  y: number;
  name: string;
  color: string;
}

// PHASE 4 UI TYPINGS
export type ActiveTab = 'ALL' | 'CLIENT' | 'DESIGNER';
export type RightSidebarTab = 'FEEDBACK' | 'ACTIVITY';