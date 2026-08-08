const STORAGE_PREFIX = "finalframe:review:v1";

export interface ReviewViewState {
  scale: number;
  positionX: number;
  positionY: number;
  scrollLeft: number;
  scrollTop: number;
  videoTime: number;
}

export interface PendingFeedbackAnchorMemory {
  surfacePoint: { x: number; y: number } | null;
  apiLocation: { x: number; y: number } | null;
  pageNumber: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  timestamp: number | null;
}

export type FeedbackDraftKind = "general" | "pinned";

export type WorkspaceLayoutMemoryMode = "desktop" | "tablet" | "mobile";

export interface WorkspaceChromeMemory {
  assetSidebarOpen: boolean;
  feedbackSidebarOpen: boolean;
  rightSidebarTab: "FEEDBACK" | "ACTIVITY";
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Review memory is a convenience only. Never block the primary workflow.
  }
}

function remove(key: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore unavailable session storage.
  }
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedPoint(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { x?: unknown; y?: unknown };
  if (typeof candidate.x !== "number" || typeof candidate.y !== "number") return null;
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return null;
  return {
    x: Math.min(100, Math.max(0, candidate.x)),
    y: Math.min(100, Math.max(0, candidate.y)),
  };
}

export function feedbackDraftStorageKey(userId: string, projectId: string, assetId: string, kind: FeedbackDraftKind): string {
  return `${STORAGE_PREFIX}:draft:${userId}:${projectId}:${assetId}:${kind}`;
}

export function loadFeedbackDraft(userId: string, projectId: string, assetId: string, kind: FeedbackDraftKind): string {
  const storage = getSessionStorage();
  if (!storage) return "";
  try {
    return (storage.getItem(feedbackDraftStorageKey(userId, projectId, assetId, kind)) ?? "").slice(0, 5_000);
  } catch {
    return "";
  }
}

export function saveFeedbackDraft(userId: string, projectId: string, assetId: string, kind: FeedbackDraftKind, text: string): void {
  const key = feedbackDraftStorageKey(userId, projectId, assetId, kind);
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    if (text.trim()) storage.setItem(key, text.slice(0, 5_000));
    else storage.removeItem(key);
  } catch {
    // Draft recovery is best-effort and must never interrupt feedback entry.
  }
}

export function clearFeedbackDraft(userId: string, projectId: string, assetId: string, kind: FeedbackDraftKind): void {
  remove(feedbackDraftStorageKey(userId, projectId, assetId, kind));
}

function pendingAnchorKey(projectId: string, assetId: string): string {
  return `${STORAGE_PREFIX}:pending-anchor:${projectId}:${assetId}`;
}

export function savePendingFeedbackAnchor(projectId: string, assetId: string, memory: PendingFeedbackAnchorMemory): void {
  writeJson(pendingAnchorKey(projectId, assetId), memory);
}

export function loadPendingFeedbackAnchor(projectId: string, assetId: string): PendingFeedbackAnchorMemory | null {
  const value = readJson<Partial<PendingFeedbackAnchorMemory>>(pendingAnchorKey(projectId, assetId));
  if (!value) return null;
  const pageNumber = typeof value.pageNumber === "number" && Number.isInteger(value.pageNumber) && value.pageNumber > 0 ? value.pageNumber : null;
  const lineStart = typeof value.lineStart === "number" && Number.isInteger(value.lineStart) && value.lineStart > 0 ? value.lineStart : null;
  const lineEnd = typeof value.lineEnd === "number" && Number.isInteger(value.lineEnd) && value.lineEnd > 0 ? value.lineEnd : null;
  const timestamp = typeof value.timestamp === "number" && Number.isFinite(value.timestamp) && value.timestamp >= 0 ? value.timestamp : null;
  const surfacePoint = boundedPoint(value.surfacePoint);
  const apiLocation = boundedPoint(value.apiLocation);
  if (!surfacePoint && !apiLocation && pageNumber === null && lineStart === null && timestamp === null) return null;
  return { surfacePoint, apiLocation, pageNumber, lineStart, lineEnd, timestamp };
}

export function clearPendingFeedbackAnchor(projectId: string, assetId: string): void {
  remove(pendingAnchorKey(projectId, assetId));
}

function viewStateKey(projectId: string, assetId: string): string {
  return `${STORAGE_PREFIX}:view:${projectId}:${assetId}`;
}

export function saveReviewViewState(projectId: string, assetId: string, state: ReviewViewState): void {
  writeJson(viewStateKey(projectId, assetId), state);
}

export function loadReviewViewState(projectId: string, assetId: string): ReviewViewState | null {
  const value = readJson<Partial<ReviewViewState>>(viewStateKey(projectId, assetId));
  if (!value) return null;
  const scale = finiteNumber(value.scale, 1);
  return {
    scale: Math.min(4, Math.max(0.35, scale)),
    positionX: finiteNumber(value.positionX),
    positionY: finiteNumber(value.positionY),
    scrollLeft: Math.max(0, finiteNumber(value.scrollLeft)),
    scrollTop: Math.max(0, finiteNumber(value.scrollTop)),
    videoTime: Math.max(0, finiteNumber(value.videoTime)),
  };
}

export function filePanelStateKey(projectId: string): string {
  return `${STORAGE_PREFIX}:files:${projectId}`;
}

export interface FilePanelMemory {
  search: string;
  category: string;
  expandedStack: string | null;
}

export function loadFilePanelMemory(projectId: string): FilePanelMemory | null {
  const value = readJson<Partial<FilePanelMemory>>(filePanelStateKey(projectId));
  if (!value) return null;
  return {
    search: typeof value.search === "string" ? value.search.slice(0, 255) : "",
    category: typeof value.category === "string" ? value.category : "all",
    expandedStack: typeof value.expandedStack === "string" ? value.expandedStack : null,
  };
}

export function saveFilePanelMemory(projectId: string, memory: FilePanelMemory): void {
  writeJson(filePanelStateKey(projectId), memory);
}

function activeAssetKey(projectId: string): string {
  return `${STORAGE_PREFIX}:active-asset:${projectId}`;
}

export function loadLastActiveAssetId(projectId: string): string | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    return storage.getItem(activeAssetKey(projectId));
  } catch {
    return null;
  }
}

export function saveLastActiveAssetId(projectId: string, assetId: string | null): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    if (assetId) storage.setItem(activeAssetKey(projectId), assetId);
    else storage.removeItem(activeAssetKey(projectId));
  } catch {
    // Best-effort review continuity only.
  }
}

function workspaceChromeKey(projectId: string, mode: WorkspaceLayoutMemoryMode): string {
  return `${STORAGE_PREFIX}:chrome:${projectId}:${mode}`;
}

export function loadWorkspaceChromeMemory(projectId: string, mode: WorkspaceLayoutMemoryMode): WorkspaceChromeMemory | null {
  const value = readJson<Partial<WorkspaceChromeMemory>>(workspaceChromeKey(projectId, mode));
  if (!value) return null;
  return {
    assetSidebarOpen: typeof value.assetSidebarOpen === "boolean" ? value.assetSidebarOpen : mode !== "mobile",
    feedbackSidebarOpen: typeof value.feedbackSidebarOpen === "boolean" ? value.feedbackSidebarOpen : mode === "desktop",
    rightSidebarTab: value.rightSidebarTab === "ACTIVITY" ? "ACTIVITY" : "FEEDBACK",
  };
}

export function saveWorkspaceChromeMemory(
  projectId: string,
  mode: WorkspaceLayoutMemoryMode,
  memory: WorkspaceChromeMemory,
): void {
  writeJson(workspaceChromeKey(projectId, mode), memory);
}
