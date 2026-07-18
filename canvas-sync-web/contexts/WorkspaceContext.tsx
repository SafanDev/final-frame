// web/contexts/WorkspaceContext.tsx
"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { API_URL } from "@/utils/helpers";
import { Project, ProjectAsset, ProjectComment, ActiveCursor, ActiveTab, RightSidebarTab } from "@/utils/types";

// --- 1. DATA CONTEXT DEFINITION ---
interface WorkspaceDataContextType {
  projectId: string;
  project: Project | null;
  setProject: (data: Project | null) => void;
  isLoading: boolean;
  socket: Socket | null;
  activeUsers: any[];
  cursors: Record<string, ActiveCursor>;
  isOwner: boolean;
  isLocked: boolean;
  currentUserId: string | null;
  fetchProjectDetails: (silent?: boolean) => Promise<void>;
  
  activeAssetId: string | null;
  setActiveAssetId: (id: string | null) => void;
  assetStacks: Record<string, ProjectAsset[]>;
  activeAsset: ProjectAsset | null;
  filteredComments: ProjectComment[];
}

interface WorkspaceUIContextType {
  isAssetSidebarOpen: boolean;
  setIsAssetSidebarOpen: (isOpen: boolean) => void;
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

export function WorkspaceProvider({ children, projectId }: { children: ReactNode; projectId: string }) {
  const { data: session } = useSession();
  
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [cursors, setCursors] = useState<Record<string, ActiveCursor>>({});
  
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [isAssetSidebarOpen, setIsAssetSidebarOpen] = useState(true);
  const [isCompareMode, setIsCompareMode] = useState(false);
  
  const [compareBaseAssetId, setCompareBaseAssetId] = useState<string | null>(null);
  const [compareTargetAssetId, setCompareTargetAssetId] = useState<string | null>(null);

  const [rightSidebarTab, setRightSidebarTab] = useState<RightSidebarTab>("FEEDBACK");
  const [activeTab, setActiveTab] = useState<ActiveTab>("ALL");
  const [activePinId, setActivePinId] = useState<string | null>(null);

  const currentUserId = (session?.user as any)?.id || null;

  const handleSetIsCompareMode = (isCompare: boolean) => {
    setIsCompareMode(isCompare);
    if (!isCompare) {
      setCompareBaseAssetId(null);
      setCompareTargetAssetId(null);
    }
  };

  const fetchProjectDetails = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true); 
    
    try {
      const res = await fetch(`${API_URL}/api/projects/workspace/${projectId}`, { 
        headers: { "Content-Type": "application/json" },
        credentials: "include" 
      });
      
      if (res.ok) {
        const data: Project = await res.json();
        setProject(data);
        setActiveAssetId((prev) => {
          if (!prev && data.assets?.length > 0) return data.assets[0].id;
          if (data.assets?.length === 0) return null;
          return prev;
        });
      }
    } catch (error) {
      console.error("Data ingestion failure:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]); 

  // PHASE 4: Only watch session user ID to avoid random token rotation remounts
  useEffect(() => {
    if (projectId && currentUserId) fetchProjectDetails();
  }, [projectId, currentUserId, fetchProjectDetails]);

  useEffect(() => {
    const handleOffline = () => toast.error("You are offline. Changes will not be saved until connection is restored.", { id: 'network-trap', duration: Infinity });
    const handleOnline = () => { toast.dismiss('network-trap'); toast.success("Connection restored!"); };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => { window.removeEventListener('offline', handleOffline); window.removeEventListener('online', handleOnline); };
  }, []);

  // PHASE 4: Strip out accessToken from dependency array to kill socket churn
  useEffect(() => {
    if (projectId && currentUserId) {
      const newSocket = io(API_URL, { withCredentials: true });
      setSocket(newSocket);
      
      newSocket.on("connect", () => {
        toast.dismiss('socket-trap');
        newSocket.emit("join-workspace", { projectId });
      });
      
      newSocket.on("connect_error", () => {
        toast.error("Authentication failed or engine unreachable.", { id: 'socket-trap' });
      });

      newSocket.on("refresh-workspace", () => fetchProjectDetails(true));
      
      newSocket.on("active-users", (users) => {
        const uniqueUsers = Array.from(new Map(users.map((u: any) => [u.socketId || u.email || u.name, u])).values());
        setActiveUsers(uniqueUsers);
      });

      newSocket.on("cursor-update", (data: ActiveCursor) => {
        setCursors((prev) => ({ ...prev, [data.socketId]: data }));
      });
      
      newSocket.on("cursor-remove", (socketId: string) => {
        setCursors((prev) => {
          const next = { ...prev };
          delete next[socketId];
          return next;
        });
      });

      return () => { newSocket.disconnect(); };
    }
  }, [projectId, currentUserId, fetchProjectDetails]);

  const assetStacks = useMemo(() => {
    if (!project?.assets) return {};
    const groups: Record<string, ProjectAsset[]> = {};
    project.assets.forEach(asset => {
      if (!groups[asset.fileName]) groups[asset.fileName] = [];
      groups[asset.fileName].push(asset);
    });
    Object.values(groups).forEach(arr => arr.sort((a, b) => b.version - a.version));
    return groups;
  }, [project?.assets]);

  const activeAsset = useMemo(() => {
    if (!project?.assets || project.assets.length === 0) return null;
    if (activeAssetId) return project.assets.find(a => a.id === activeAssetId) || null;
    const firstStackName = Object.keys(assetStacks)[0];
    return firstStackName ? assetStacks[firstStackName][0] : null;
  }, [project?.assets, activeAssetId, assetStacks]);

  const filteredComments = useMemo(() => {
    if (!activeAsset) return [];
    return activeAsset.comments.filter(comment => {
      if (isCompareMode) return false; 
      if (activeTab === 'ALL') return true;
      const isDesignerComment = comment.authorId === project?.ownerId;
      if (activeTab === 'CLIENT' && isDesignerComment) return false;
      if (activeTab === 'DESIGNER' && !isDesignerComment) return false;
      return true;
    });
  }, [activeAsset, activeTab, isCompareMode, project?.ownerId]);

  const isOwner = Boolean(project?.ownerId && currentUserId === project.ownerId);
  const isLocked = project?.status === 'APPROVED' || project?.isArchived === true;

  const dataValue: WorkspaceDataContextType = {
    projectId, project, setProject, isLoading, socket, activeUsers, cursors,
    isOwner, isLocked, currentUserId, fetchProjectDetails,
    activeAssetId, setActiveAssetId, assetStacks, activeAsset, filteredComments
  };

  const uiValue: WorkspaceUIContextType = {
    isAssetSidebarOpen, setIsAssetSidebarOpen, isCompareMode, setIsCompareMode: handleSetIsCompareMode, 
    compareBaseAssetId, setCompareBaseAssetId, compareTargetAssetId, setCompareTargetAssetId,
    rightSidebarTab, setRightSidebarTab, activeTab, setActiveTab, activePinId, setActivePinId
  };

  return (
    <WorkspaceDataContext.Provider value={dataValue}>
      <WorkspaceUIContext.Provider value={uiValue}>
        {children}
      </WorkspaceUIContext.Provider>
    </WorkspaceDataContext.Provider>
  );
}

export function useWorkspaceData() {
  const context = useContext(WorkspaceDataContext);
  if (context === undefined) throw new Error("useWorkspaceData must be used within a WorkspaceProvider");
  return context;
}

export function useWorkspaceUI() {
  const context = useContext(WorkspaceUIContext);
  if (context === undefined) throw new Error("useWorkspaceUI must be used within a WorkspaceProvider");
  return context;
}

export function useWorkspace() {
  const data = useWorkspaceData();
  const ui = useWorkspaceUI();
  return { ...data, ...ui };
}