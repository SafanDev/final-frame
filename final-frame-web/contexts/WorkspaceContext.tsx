"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { sessionExpiredEventName } from "@/lib/api/client";
import { loadAssetProcessingStatus, loadWorkspace } from "@/lib/api/projects";
import type {
  AssetProcessingSnapshot,
  ProjectAsset,
  ProjectComment,
  WorkspaceProject,
} from "@/lib/api/types";
import { createRealtimeClient, getSocketErrorCode } from "@/lib/realtime/client";
import { mergeAssetsByFreshness } from "@/lib/workspace/asset-merge-core";
import { getAssetUploadMimeType } from "@/lib/assets/file-policy";
import { clearRemoteCursors, publishRemoteCursor, removeRemoteCursor } from "@/lib/realtime/cursor-events";
import {
  loadLastActiveAssetId,
  loadWorkspaceChromeMemory,
  saveLastActiveAssetId,
  saveWorkspaceChromeMemory,
} from "@/lib/workspace/review-session";
import type {
  ActiveUser,
  FinalFrameSocket,
  WorkspaceRefreshPayload,
} from "@/lib/realtime/contracts";

export type ActiveTab = "ALL" | "CLIENT" | "DESIGNER";
export type RightSidebarTab = "FEEDBACK" | "ACTIVITY";
export type RealtimeStatus =
  | "offline"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

type WorkspaceLayoutMode = "mobile" | "tablet" | "desktop";

const currentWorkspaceLayoutMode = (): WorkspaceLayoutMode => {
  if (window.matchMedia("(min-width: 1180px)").matches) return "desktop";
  if (window.matchMedia("(min-width: 1024px)").matches) return "tablet";
  return "mobile";
};

export interface LocalUploadPreview {
  token: string;
  file: File;
  objectUrl: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  assetId: string | null;
}

export interface WorkspaceIssue {
  kind: "load" | "not-found" | "access-revoked" | "deleted";
  title: string;
  message: string;
  requestId: string | null;
  retryable: boolean;
}

interface WorkspaceDataContextType {
  projectId: string;
  project: WorkspaceProject | null;
  setProject: Dispatch<SetStateAction<WorkspaceProject | null>>;
  isLoading: boolean;
  isRefreshing: boolean;
  workspaceIssue: WorkspaceIssue | null;
  realtimeStatus: RealtimeStatus;
  realtimeMessage: string;
  isOnline: boolean;
  activeUsers: ActiveUser[];
  isOwner: boolean;
  isLocked: boolean;
  currentUserId: string | null;
  fetchProjectDetails: (silent?: boolean) => Promise<void>;
  refreshWorkspace: (reason?: string, silent?: boolean) => Promise<void>;
  retryWorkspace: () => Promise<void>;
  emitCursor: (assetId: string, x: number, y: number) => void;
  activeAssetId: string | null;
  setActiveAssetId: (id: string | null) => void;
  assetStacks: Record<string, ProjectAsset[]>;
  activeAsset: ProjectAsset | null;
  filteredComments: ProjectComment[];
  localUploadPreview: LocalUploadPreview | null;
  beginLocalUploadPreview: (file: File, displayName?: string) => string | null;
  bindLocalUploadPreview: (token: string, assetId: string) => void;
  clearLocalUploadPreview: (token?: string) => void;
}

interface WorkspaceUIContextType {
  isAssetSidebarOpen: boolean;
  setIsAssetSidebarOpen: (isOpen: boolean) => void;
  isFeedbackSidebarOpen: boolean;
  setIsFeedbackSidebarOpen: (isOpen: boolean) => void;
  openAssetSidebar: () => void;
  openFeedbackSidebar: () => void;
  closeMobileSidebars: () => void;
  isCompareMode: boolean;
  setIsCompareMode: (isCompare: boolean) => void;
  compareBaseAssetId: string | null;
  setCompareBaseAssetId: (id: string | null) => void;
  compareTargetAssetId: string | null;
  setCompareTargetAssetId: (id: string | null) => void;
  rightSidebarTab: RightSidebarTab;
  setRightSidebarTab: (tab: RightSidebarTab) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  activePinId: string | null;
  setActivePinId: (id: string | null) => void;
}

const WorkspaceDataContext = createContext<WorkspaceDataContextType | undefined>(undefined);
const WorkspaceUIContext = createContext<WorkspaceUIContextType | undefined>(undefined);

function issueFromError(error: unknown): WorkspaceIssue {
  const normalized = normalizeApiError(error);

  if (normalized.status === 404) {
    return {
      kind: "not-found",
      title: "Project unavailable",
      message: "This project does not exist or is no longer available to this account.",
      requestId: normalized.requestId,
      retryable: false,
    };
  }

  if (normalized.status === 403) {
    return {
      kind: "access-revoked",
      title: "Access unavailable",
      message: "Project access is no longer available for this account.",
      requestId: normalized.requestId,
      retryable: false,
    };
  }

  return {
    kind: "load",
    title: "Workspace could not be loaded",
    message: getUserFacingErrorMessage(error, "The workspace could not be loaded."),
    requestId: normalized.requestId,
    retryable: normalized.retryable,
  };
}

function hasUnsettledAssets(assets: readonly ProjectAsset[]): boolean {
  return assets.some((asset) => asset.processingStatus === "PENDING" || asset.processingStatus === "PROCESSING");
}

function applyAssetProcessingSnapshots(
  current: WorkspaceProject,
  snapshots: readonly AssetProcessingSnapshot[],
): WorkspaceProject {
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  let changed = false;
  const assets = current.assets.map((asset) => {
    const snapshot = byId.get(asset.id);
    if (!snapshot || snapshot.updatedAt.localeCompare(asset.updatedAt) < 0) return asset;
    const next = { ...asset, ...snapshot };
    if (
      next.processingStatus === asset.processingStatus
      && next.processingError === asset.processingError
      && next.previewMimeType === asset.previewMimeType
      && next.previewFileSize === asset.previewFileSize
      && next.width === asset.width
      && next.height === asset.height
      && next.durationSeconds === asset.durationSeconds
      && next.updatedAt === asset.updatedAt
    ) return asset;
    changed = true;
    return next;
  });

  const finalSnapshot = current.finalAssetId ? byId.get(current.finalAssetId) : undefined;
  const finalAssetChanged = Boolean(current.finalAsset && finalSnapshot && (
    current.finalAsset.processingStatus !== finalSnapshot.processingStatus
    || current.finalAsset.previewMimeType !== finalSnapshot.previewMimeType
    || current.finalAsset.previewFileSize !== finalSnapshot.previewFileSize
    || current.finalAsset.width !== finalSnapshot.width
    || current.finalAsset.height !== finalSnapshot.height
    || current.finalAsset.durationSeconds !== finalSnapshot.durationSeconds
  ));
  const finalAsset = current.finalAsset && finalSnapshot && finalAssetChanged
    ? {
        ...current.finalAsset,
        processingStatus: finalSnapshot.processingStatus,
        previewMimeType: finalSnapshot.previewMimeType,
        previewFileSize: finalSnapshot.previewFileSize,
        width: finalSnapshot.width,
        height: finalSnapshot.height,
        durationSeconds: finalSnapshot.durationSeconds,
      }
    : current.finalAsset;

  return changed || finalAssetChanged ? { ...current, assets, finalAsset } : current;
}

function groupAssetStacks(assets: ProjectAsset[]): Record<string, ProjectAsset[]> {
  const groups: Record<string, ProjectAsset[]> = {};
  for (const asset of assets) {
    (groups[asset.stackKey] ??= []).push(asset);
  }
  for (const stack of Object.values(groups)) {
    stack.sort((left, right) => right.version - left.version);
  }
  return groups;
}

function mergeWorkspacePages(
  current: WorkspaceProject | null,
  incoming: WorkspaceProject,
  reason: string,
): WorkspaceProject {
  const replaceReasons = new Set([
    "initial",
    "manual",
    "conflict",
    "connection-restored",
    "asset-deleted",
  ]);

  if (!current || replaceReasons.has(reason)) return incoming;

  const assets = mergeAssetsByFreshness(current.assets, incoming.assets);

  const activity = new Map(current.activityLogs.map((entry) => [entry.id, entry]));
  for (const entry of incoming.activityLogs) activity.set(entry.id, entry);

  return {
    ...incoming,
    assets,
    activityLogs: Array.from(activity.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    pageInfo: {
      assets: current.assets.length > incoming.assets.length
        ? current.pageInfo.assets
        : incoming.pageInfo.assets,
      activityLogs: current.activityLogs.length > incoming.activityLogs.length
        ? current.pageInfo.activityLogs
        : incoming.pageInfo.activityLogs,
    },
  };
}

export function WorkspaceProvider({
  children,
  projectId,
}: {
  children: ReactNode;
  projectId: string;
}) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const currentUserId = session?.user.id ?? null;

  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const hasProject = Boolean(project);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workspaceIssue, setWorkspaceIssue] = useState<WorkspaceIssue | null>(null);
  const [socket, setSocket] = useState<FinalFrameSocket | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [realtimeMessage, setRealtimeMessage] = useState("Connecting to live collaboration…");
  const [isOnline, setIsOnline] = useState(true);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [localUploadPreview, setLocalUploadPreview] = useState<LocalUploadPreview | null>(null);
  const hasPendingAssetProcessing = useMemo(
    () => Boolean(project && hasUnsettledAssets(project.assets)),
    [project],
  );

  const [isAssetSidebarOpen, setIsAssetSidebarOpenState] = useState(false);
  const [isFeedbackSidebarOpen, setIsFeedbackSidebarOpenState] = useState(false);
  const [isCompareMode, setIsCompareModeState] = useState(false);
  const [compareBaseAssetId, setCompareBaseAssetId] = useState<string | null>(null);
  const [compareTargetAssetId, setCompareTargetAssetId] = useState<string | null>(null);
  const [rightSidebarTab, setRightSidebarTab] = useState<RightSidebarTab>("FEEDBACK");
  const [activeTab, setActiveTab] = useState<ActiveTab>("ALL");
  const [activePinId, setActivePinId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const localUploadPreviewRef = useRef<LocalUploadPreview | null>(null);
  const projectRef = useRef<WorkspaceProject | null>(null);
  const loadSequenceRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const processingStatusAbortRef = useRef<AbortController | null>(null);
  const processingStatusSequenceRef = useRef(0);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCursorRef = useRef<{ assetId: string; x: number; y: number } | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const layoutModeRef = useRef<WorkspaceLayoutMode | null>(null);
  const skipNextChromePersistRef = useRef(false);
  const sidebarPreferencesRef = useRef<Record<WorkspaceLayoutMode, { asset: boolean; feedback: boolean }>>({
    desktop: { asset: true, feedback: true },
    tablet: { asset: true, feedback: false },
    mobile: { asset: false, feedback: false },
  });

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const commitLocalUploadPreview = useCallback((next: LocalUploadPreview | null) => {
    const current = localUploadPreviewRef.current;
    if (current?.objectUrl && current.objectUrl !== next?.objectUrl) URL.revokeObjectURL(current.objectUrl);
    localUploadPreviewRef.current = next;
    setLocalUploadPreview(next);
  }, []);

  const beginLocalUploadPreview = useCallback((file: File, displayName?: string): string | null => {
    const mimeType = getAssetUploadMimeType(file);
    if (!mimeType) return null;
    const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const needsObjectUrl = mimeType.startsWith("image/") || mimeType.startsWith("video/");
    commitLocalUploadPreview({
      token,
      file,
      objectUrl: needsObjectUrl ? URL.createObjectURL(file) : null,
      fileName: displayName?.trim() || file.name,
      mimeType,
      fileSize: file.size,
      assetId: null,
    });
    return token;
  }, [commitLocalUploadPreview]);

  const bindLocalUploadPreview = useCallback((token: string, assetId: string) => {
    const current = localUploadPreviewRef.current;
    if (!current || current.token !== token) return;
    const next = { ...current, assetId };
    localUploadPreviewRef.current = next;
    setLocalUploadPreview(next);
  }, []);

  const clearLocalUploadPreview = useCallback((token?: string) => {
    const current = localUploadPreviewRef.current;
    if (!current || (token && current.token !== token)) return;
    commitLocalUploadPreview(null);
  }, [commitLocalUploadPreview]);

  useEffect(() => {
    // React Strict Mode intentionally mounts, cleans up, and mounts effects again
    // in development. Reset the guard on every effect setup so valid workspace
    // responses are not discarded after the simulated cleanup.
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      processingStatusAbortRef.current?.abort();
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      if (cursorFrameRef.current !== null) window.cancelAnimationFrame(cursorFrameRef.current);
      const localPreview = localUploadPreviewRef.current;
      if (localPreview?.objectUrl) URL.revokeObjectURL(localPreview.objectUrl);
      localUploadPreviewRef.current = null;
    };
  }, []);

  const refreshWorkspace = useCallback(async (reason = "manual", silent = false) => {
    const sequence = ++loadSequenceRef.current;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    const showRefreshIndicator = silent && reason !== "asset-processing-poll";
    if (!silent) setIsLoading(true);
    else if (showRefreshIndicator) setIsRefreshing(true);

    try {
      const incomingProject = await loadWorkspace(projectId, controller.signal);
      if (!mountedRef.current || sequence !== loadSequenceRef.current) return;

      const nextProject = mergeWorkspacePages(projectRef.current, incomingProject, reason);
      projectRef.current = nextProject;
      setProject(nextProject);
      setWorkspaceIssue(null);
      setActiveAssetId((current) => {
        if (current && nextProject.assets.some((asset) => asset.id === current)) return current;
        const remembered = loadLastActiveAssetId(projectId);
        if (remembered && nextProject.assets.some((asset) => asset.id === remembered)) return remembered;
        return nextProject.assets[0]?.id ?? null;
      });

      if (reason !== "initial" && reason !== "manual") {
        setActivePinId((current) => {
          if (!current) return null;
          return nextProject.assets.some((asset) => asset.comments.some((comment) => comment.id === current))
            ? current
            : null;
        });
      }
    } catch (error) {
      const normalized = normalizeApiError(error);
      if (normalized.kind === "aborted" || !mountedRef.current || sequence !== loadSequenceRef.current) return;

      const issue = issueFromError(error);
      if (!projectRef.current || issue.kind !== "load") setWorkspaceIssue(issue);
      else {
        toast.error(issue.message, {
          id: "workspace-refresh-error",
          description: issue.requestId ? `Support reference: ${issue.requestId}` : undefined,
        });
      }
    } finally {
      if (mountedRef.current && sequence === loadSequenceRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [projectId]);

  const refreshAssetProcessingStatus = useCallback(async (): Promise<void> => {
    processingStatusAbortRef.current?.abort();
    const controller = new AbortController();
    processingStatusAbortRef.current = controller;
    const sequence = ++processingStatusSequenceRef.current;

    try {
      const response = await loadAssetProcessingStatus(projectId, controller.signal);
      if (!mountedRef.current || controller.signal.aborted || sequence !== processingStatusSequenceRef.current) return;
      const current = projectRef.current;
      if (!current) return;
      const next = applyAssetProcessingSnapshots(current, response.assets);
      if (next === current) return;
      projectRef.current = next;
      setProject(next);
    } catch (error) {
      const normalized = normalizeApiError(error);
      if (normalized.kind === "aborted" || controller.signal.aborted || !mountedRef.current) return;
      if (normalized.status === 403 || normalized.status === 404) {
        setWorkspaceIssue(issueFromError(error));
      }
    } finally {
      if (processingStatusAbortRef.current === controller) processingStatusAbortRef.current = null;
    }
  }, [projectId]);

  const fetchProjectDetails = useCallback((silent = false) => (
    refreshWorkspace("component-request", silent)
  ), [refreshWorkspace]);

  const retryWorkspace = useCallback(() => refreshWorkspace("manual", false), [refreshWorkspace]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && currentUserId) {
      void refreshWorkspace("initial", false);
    }
  }, [currentUserId, refreshWorkspace, sessionStatus]);

  useEffect(() => {
    if (
      sessionStatus !== "authenticated"
      || !currentUserId
      || !hasPendingAssetProcessing
      || workspaceIssue
    ) return;

    let cancelled = false;
    let timer: number | null = null;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        timer = null;
        void poll();
      }, delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible" && navigator.onLine) {
        await refreshAssetProcessingStatus();
      }
      schedule(realtimeStatus === "connected" ? 30_000 : 3_000);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      void poll();
    };

    schedule(realtimeStatus === "connected" ? 15_000 : 1_500);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentUserId, hasPendingAssetProcessing, realtimeStatus, refreshAssetProcessingStatus, sessionStatus, workspaceIssue]);

  useEffect(() => {
    layoutModeRef.current = null;
    const desktop = window.matchMedia("(min-width: 1180px)");
    const tablet = window.matchMedia("(min-width: 1024px) and (max-width: 1179px)");
    const apply = () => {
      const nextMode = currentWorkspaceLayoutMode();
      if (layoutModeRef.current === nextMode) return;
      layoutModeRef.current = nextMode;
      const remembered = loadWorkspaceChromeMemory(projectId, nextMode);
      skipNextChromePersistRef.current = Boolean(remembered);
      if (remembered) {
        sidebarPreferencesRef.current[nextMode] = {
          asset: remembered.assetSidebarOpen,
          feedback: remembered.feedbackSidebarOpen,
        };
        setRightSidebarTab(remembered.rightSidebarTab);
      }
      const preference = sidebarPreferencesRef.current[nextMode];
      setIsAssetSidebarOpenState(preference.asset);
      setIsFeedbackSidebarOpenState(preference.feedback);
    };
    apply();
    desktop.addEventListener("change", apply);
    tablet.addEventListener("change", apply);
    return () => {
      desktop.removeEventListener("change", apply);
      tablet.removeEventListener("change", apply);
    };
  }, [projectId]);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      setRealtimeStatus("offline");
      setRealtimeMessage("Offline. Realtime updates are paused.");
    };
    const handleOnline = () => {
      setIsOnline(true);
      setRealtimeStatus((current) => current === "offline" ? "reconnecting" : current);
      setRealtimeMessage("Connection restored. Rejoining collaboration…");
      void refreshWorkspace("connection-restored", true);
    };

    setIsOnline(navigator.onLine);
    if (!navigator.onLine) handleOffline();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !currentUserId || !hasProject || workspaceIssue) {
      return;
    }

    const realtime = createRealtimeClient();
    setSocket(realtime);
    setRealtimeStatus(navigator.onLine ? "connecting" : "offline");
    setRealtimeMessage(navigator.onLine ? "Connecting to live collaboration…" : "Offline. Realtime updates are paused.");

    const scheduleRefresh = (payload: WorkspaceRefreshPayload) => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = setTimeout(() => {
        if (payload.reason === "asset-processing-settled") {
          void refreshAssetProcessingStatus();
          return;
        }
        void refreshWorkspace(payload.reason || "realtime", true);
      }, 180);
    };

    realtime.on("connect", () => {
      setRealtimeStatus("connected");
      setRealtimeMessage("Live collaboration connected.");
      realtime.emit("join-workspace", { projectId });
      toast.dismiss("workspace-realtime");
    });

    realtime.io.on("reconnect_attempt", () => {
      setRealtimeStatus(navigator.onLine ? "reconnecting" : "offline");
      setRealtimeMessage(navigator.onLine ? "Reconnecting live collaboration…" : "Offline. Realtime updates are paused.");
    });

    realtime.on("disconnect", (reason) => {
      setActiveUsers([]);
      clearRemoteCursors();
      if (!navigator.onLine) {
        setRealtimeStatus("offline");
        setRealtimeMessage("Offline. Realtime updates are paused.");
      } else if (reason === "io client disconnect") {
        setRealtimeStatus("disconnected");
        setRealtimeMessage("Live collaboration disconnected.");
      } else {
        setRealtimeStatus("reconnecting");
        setRealtimeMessage("Live collaboration interrupted. Reconnecting…");
      }
    });

    realtime.on("connect_error", (error) => {
      const code = getSocketErrorCode(error);
      setRealtimeStatus(code === "SOCKET_AUTHENTICATION_FAILED" ? "error" : "reconnecting");
      if (code === "SOCKET_AUTHENTICATION_FAILED") {
        realtime.disconnect();
        window.dispatchEvent(new CustomEvent(sessionExpiredEventName));
      }
      setRealtimeMessage(
        code === "SOCKET_AUTHENTICATION_FAILED"
          ? "The collaboration session could not be authenticated."
          : code.includes("LIMIT") || code.includes("RATE_LIMITED")
            ? "Realtime connection limit reached. The workspace will keep retrying safely."
            : "Live collaboration is temporarily unavailable. Reconnecting…",
      );
    });

    realtime.on("active-users", (users: ActiveUser[]) => {
      const unique: ActiveUser[] = Array.from(new Map(users.map((user: ActiveUser) => [user.id, user])).values());
      setActiveUsers(unique);
    });

    realtime.on("cursor-update", (cursor) => {
      if (cursor.projectId !== projectId || cursor.socketId === realtime.id) return;
      publishRemoteCursor(cursor);
    });

    realtime.on("cursor-remove", (socketId) => {
      removeRemoteCursor(socketId);
    });

    realtime.on("refresh-workspace", scheduleRefresh);

    realtime.on("workspace-error", (payload) => {
      if (payload.code === "PROJECT_ACCESS_DENIED") {
        setWorkspaceIssue({
          kind: "access-revoked",
          title: "Project access removed",
          message: payload.message || "Project access is no longer available.",
          requestId: null,
          retryable: false,
        });
        return;
      }
      toast.error(payload.message || "The collaboration workspace reported an error.", {
        id: "workspace-realtime",
      });
    });

    realtime.on("project-deleted", (payload) => {
      if (payload.projectId !== projectId) return;
      setProject(null);
      setActiveUsers([]);
      clearRemoteCursors();
      setWorkspaceIssue({
        kind: "deleted",
        title: "Project deleted",
        message: "This project was deleted in another session. Its cloud files are queued for secure cleanup.",
        requestId: null,
        retryable: false,
      });
    });

    realtime.on("project-member-removed", (payload) => {
      if (payload.projectId !== projectId) return;
      if (payload.userId === currentUserId) {
        setProject(null);
        setActiveUsers([]);
        clearRemoteCursors();
        setWorkspaceIssue({
          kind: "access-revoked",
          title: "Project access removed",
          message: "The project owner removed this account from the workspace.",
          requestId: null,
          retryable: false,
        });
      } else {
        void refreshWorkspace("member-removed", true);
      }
    });

    realtime.connect();

    return () => {
      realtime.removeAllListeners();
      realtime.io.removeAllListeners();
      realtime.disconnect();
      if (cursorFrameRef.current !== null) window.cancelAnimationFrame(cursorFrameRef.current);
      cursorFrameRef.current = null;
      pendingCursorRef.current = null;
      setSocket(null);
      setActiveUsers([]);
      clearRemoteCursors();
    };
  }, [currentUserId, hasProject, projectId, refreshAssetProcessingStatus, refreshWorkspace, sessionStatus, workspaceIssue]);


  useEffect(() => {
    if (!project) return;
    if (activeAssetId && project.assets.some((asset) => asset.id === activeAssetId)) {
      saveLastActiveAssetId(projectId, activeAssetId);
      return;
    }
    const remembered = loadLastActiveAssetId(projectId);
    const nextAssetId = remembered && project.assets.some((asset) => asset.id === remembered)
      ? remembered
      : project.assets[0]?.id ?? null;
    setActiveAssetId(nextAssetId);
    saveLastActiveAssetId(projectId, nextAssetId);
    setActivePinId(null);
    setIsCompareModeState(false);
  }, [activeAssetId, project, projectId]);

  useEffect(() => {
    const localPreview = localUploadPreviewRef.current;
    if (!localPreview?.assetId || !project) return;
    const asset = project.assets.find((candidate) => candidate.id === localPreview.assetId);
    if (asset?.processingStatus === "REJECTED") clearLocalUploadPreview(localPreview.token);
  }, [clearLocalUploadPreview, project]);

  const emitCursor = useCallback((assetId: string, x: number, y: number) => {
    if (!socket?.connected || !assetId || !Number.isFinite(x) || !Number.isFinite(y)) return;
    pendingCursorRef.current = {
      assetId,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
    if (cursorFrameRef.current !== null) return;
    cursorFrameRef.current = window.requestAnimationFrame(() => {
      cursorFrameRef.current = null;
      const point = pendingCursorRef.current;
      pendingCursorRef.current = null;
      if (point && socket.connected) socket.volatile.emit("cursor-move", { projectId, ...point });
    });
  }, [projectId, socket]);

  const assetStacks = useMemo(() => groupAssetStacks(project?.assets ?? []), [project?.assets]);

  const activeAsset = useMemo(() => {
    if (!project?.assets.length) return null;
    return project.assets.find((asset) => asset.id === activeAssetId) ?? project.assets[0] ?? null;
  }, [activeAssetId, project?.assets]);

  const filteredComments = useMemo(() => {
    if (!activeAsset || isCompareMode) return [];
    if (activeTab === "ALL") return activeAsset.comments;
    return activeAsset.comments.filter((comment) => {
      const designerComment = comment.authorId === project?.ownerId;
      return activeTab === "DESIGNER" ? designerComment : !designerComment;
    });
  }, [activeAsset, activeTab, isCompareMode, project?.ownerId]);

  const isOwner = Boolean(project && currentUserId === project.ownerId);
  const isLocked = Boolean(project && (project.status === "APPROVED" || project.isArchived));

  const setIsCompareMode = useCallback((enabled: boolean) => {
    setIsCompareModeState(enabled);
    if (!enabled) {
      setCompareBaseAssetId(null);
      setCompareTargetAssetId(null);
    }
  }, []);

  const persistChromePreference = useCallback((mode: WorkspaceLayoutMode) => {
    const preference = sidebarPreferencesRef.current[mode];
    saveWorkspaceChromeMemory(projectId, mode, {
      assetSidebarOpen: preference.asset,
      feedbackSidebarOpen: preference.feedback,
      rightSidebarTab,
    });
  }, [projectId, rightSidebarTab]);

  const setIsAssetSidebarOpen = useCallback((open: boolean) => {
    const mode = currentWorkspaceLayoutMode();
    const preference = sidebarPreferencesRef.current[mode];
    preference.asset = open;
    setIsAssetSidebarOpenState(open);
    if (open && mode === "mobile") {
      preference.feedback = false;
      setIsFeedbackSidebarOpenState(false);
    }
    persistChromePreference(mode);
  }, [persistChromePreference]);

  const setIsFeedbackSidebarOpen = useCallback((open: boolean) => {
    const mode = currentWorkspaceLayoutMode();
    const preference = sidebarPreferencesRef.current[mode];
    preference.feedback = open;
    setIsFeedbackSidebarOpenState(open);
    if (open && mode === "mobile") {
      preference.asset = false;
      setIsAssetSidebarOpenState(false);
    }
    persistChromePreference(mode);
  }, [persistChromePreference]);

  const openAssetSidebar = useCallback(() => setIsAssetSidebarOpen(true), [setIsAssetSidebarOpen]);
  const openFeedbackSidebar = useCallback(() => setIsFeedbackSidebarOpen(true), [setIsFeedbackSidebarOpen]);
  const closeMobileSidebars = useCallback(() => {
    if (currentWorkspaceLayoutMode() === "mobile") {
      sidebarPreferencesRef.current.mobile = { asset: false, feedback: false };
      setIsAssetSidebarOpenState(false);
      setIsFeedbackSidebarOpenState(false);
      saveWorkspaceChromeMemory(projectId, "mobile", {
        assetSidebarOpen: false,
        feedbackSidebarOpen: false,
        rightSidebarTab,
      });
    }
  }, [projectId, rightSidebarTab]);

  useEffect(() => {
    if (skipNextChromePersistRef.current) {
      skipNextChromePersistRef.current = false;
      return;
    }
    const mode = currentWorkspaceLayoutMode();
    persistChromePreference(mode);
  }, [persistChromePreference, rightSidebarTab]);

  const dataValue = useMemo<WorkspaceDataContextType>(() => ({
    projectId,
    project,
    setProject,
    isLoading,
    isRefreshing,
    workspaceIssue,
    realtimeStatus,
    realtimeMessage,
    isOnline,
    activeUsers,
    isOwner,
    isLocked,
    currentUserId,
    fetchProjectDetails,
    refreshWorkspace,
    retryWorkspace,
    emitCursor,
    activeAssetId,
    setActiveAssetId,
    assetStacks,
    activeAsset,
    filteredComments,
    localUploadPreview,
    beginLocalUploadPreview,
    bindLocalUploadPreview,
    clearLocalUploadPreview,
  }), [
    activeAsset,
    activeAssetId,
    beginLocalUploadPreview,
    bindLocalUploadPreview,
    clearLocalUploadPreview,
    activeUsers,
    assetStacks,
    currentUserId,
    emitCursor,
    fetchProjectDetails,
    filteredComments,
    isLoading,
    isLocked,
    isOnline,
    isOwner,
    isRefreshing,
    localUploadPreview,
    project,
    projectId,
    realtimeMessage,
    realtimeStatus,
    refreshWorkspace,
    retryWorkspace,
    workspaceIssue,
  ]);

  const uiValue = useMemo<WorkspaceUIContextType>(() => ({
    isAssetSidebarOpen,
    setIsAssetSidebarOpen,
    isFeedbackSidebarOpen,
    setIsFeedbackSidebarOpen,
    openAssetSidebar,
    openFeedbackSidebar,
    closeMobileSidebars,
    isCompareMode,
    setIsCompareMode,
    compareBaseAssetId,
    setCompareBaseAssetId,
    compareTargetAssetId,
    setCompareTargetAssetId,
    rightSidebarTab,
    setRightSidebarTab,
    activeTab,
    setActiveTab,
    activePinId,
    setActivePinId,
  }), [
    activePinId,
    activeTab,
    closeMobileSidebars,
    compareBaseAssetId,
    compareTargetAssetId,
    isAssetSidebarOpen,
    isCompareMode,
    isFeedbackSidebarOpen,
    openAssetSidebar,
    openFeedbackSidebar,
    rightSidebarTab,
    setIsAssetSidebarOpen,
    setIsCompareMode,
    setIsFeedbackSidebarOpen,
  ]);

  useEffect(() => {
    if (workspaceIssue?.kind === "deleted" || workspaceIssue?.kind === "access-revoked") {
      const timer = window.setTimeout(() => router.prefetch("/app"), 250);
      return () => window.clearTimeout(timer);
    }
  }, [router, workspaceIssue?.kind]);

  return (
    <WorkspaceDataContext.Provider value={dataValue}>
      <WorkspaceUIContext.Provider value={uiValue}>
        {children}
      </WorkspaceUIContext.Provider>
    </WorkspaceDataContext.Provider>
  );
}

export function useWorkspaceData(): WorkspaceDataContextType {
  const context = useContext(WorkspaceDataContext);
  if (!context) throw new Error("useWorkspaceData must be used within WorkspaceProvider.");
  return context;
}

export function useWorkspaceUI(): WorkspaceUIContextType {
  const context = useContext(WorkspaceUIContext);
  if (!context) throw new Error("useWorkspaceUI must be used within WorkspaceProvider.");
  return context;
}

export function useWorkspace() {
  return { ...useWorkspaceData(), ...useWorkspaceUI() };
}
