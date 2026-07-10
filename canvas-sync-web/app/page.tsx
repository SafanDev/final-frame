"use client";

// ============================================================================
// FinalFrame Application Module
// ============================================================================

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo, useRef, MouseEvent, WheelEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import dynamic from "next/dynamic";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const DynamicPdfEngine = dynamic(() => import("@/components/PdfEngine"), {
  ssr: false,
  loading: () => <div className="text-emerald-500 font-mono text-xs animate-pulse p-20 uppercase tracking-widest text-center w-full">Downloading Engine...</div>
});

const getAssetType = (url: string) => {
  if (!url) return 'unknown';
  const cleanUrl = url.split('?')[0]; 
  const extension = cleanUrl.split('.').pop()?.toLowerCase();
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) return 'image';
  if (['mp4', 'webm', 'ogg'].includes(extension || '')) return 'video';
  if (['mp3', 'wav'].includes(extension || '')) return 'audio';
  if (['pdf'].includes(extension || '')) return 'pdf';
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'md'].includes(extension || '')) return 'code';
  
  return 'unknown';
};

const getCodeLanguage = (url: string) => {
  if (!url) return 'javascript';
  const cleanUrl = url.split('?')[0];
  const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    'js': 'javascript', 'jsx': 'jsx', 'ts': 'typescript', 'tsx': 'tsx',
    'py': 'python', 'html': 'html', 'css': 'css', 'json': 'json',
    'java': 'java', 'cpp': 'cpp', 'c': 'c', 'md': 'markdown'
  };
  return map[ext] || 'javascript';
};

const parseComment = (raw: string) => {
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw);
      if (obj.t !== undefined || obj.audioUrl !== undefined || obj.ts !== undefined) {
        return { text: obj.t || "", timestamp: obj.ts ?? null, audioUrl: obj.audioUrl || null };
      }
    } catch (e) {}
  }
  return { text: raw, timestamp: null, audioUrl: null };
};

const CURSOR_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f43f5e', '#f59e0b', '#06b6d4'];
const assetCategories = [
  { id: 'image', title: 'Images', icon: '🖼' },
  { id: 'pdf', title: 'Documents', icon: '📄' },
  { id: 'code', title: 'Source Code', icon: '</>' },
  { id: 'video', title: 'Video & Audio', icon: '🎬' },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ----------------------------------------------------------------------------
// Workspace View Component
// ----------------------------------------------------------------------------
function WorkspaceView({ projectId }: { projectId: string }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [project, setProject] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isAssetSidebarOpen, setIsAssetSidebarOpen] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editAssetText, setEditAssetText] = useState("");
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false);
  const [uploadingToFileName, setUploadingToFileName] = useState<string | null>(null);
  const versionFileInputRef = useRef<HTMLInputElement>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareSliderPos, setCompareSliderPos] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const compareContainerRef = useRef<HTMLDivElement>(null);

  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiCooldown, setAiCooldown] = useState(0);

  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; type: 'asset' | 'comment' | null; targetId: string; title: string; message: string; }>({ isOpen: false, type: null, targetId: "", title: "", message: "" });
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false); 
  const [errorToast, setErrorToast] = useState(""); 
  
  const [rightSidebarTab, setRightSidebarTab] = useState<"FEEDBACK" | "ACTIVITY">("FEEDBACK");
  const [activeTab, setActiveTab] = useState<"ALL" | "CLIENT" | "DESIGNER">("ALL"); 

  const [activePinId, setActivePinId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const assetRef = useRef<HTMLDivElement>(null); 
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const isMoved = useRef(false); 

  const initialTouchDist = useRef<number>(0);
  const initialPinchScale = useRef<number>(1);
  const [isMediaLoading, setIsMediaLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false); 

  const [pdfPages, setPdfPages] = useState<number>(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1);
  const [pdfInputValue, setPdfInputValue] = useState<string>("1"); 
  const isPdfScrubbing = useRef(false); 

  const [codeContent, setCodeContent] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cursors, setCursors] = useState<Record<string, { x: number, y: number, name: string, color: string }>>({});
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const myColor = useMemo(() => CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)], []);
  const lastEmit = useRef<number>(0);

  useEffect(() => {
    if (status === "authenticated" && projectId && session?.user) {
      const newSocket = io(API_URL);
      setSocket(newSocket);
      
      newSocket.on("connect", () => newSocket.emit("join-workspace", { projectId, user: session.user }));
      newSocket.on("refresh-workspace", () => fetchProjectDetails());
      
      newSocket.on("active-users", (users) => {
        const uniqueUsers = Array.from(new Map(users.map((u: any) => [u.email || u.name, u])).values());
        setActiveUsers(uniqueUsers);
      });

      newSocket.on("cursor-update", (data) => { setCursors(prev => ({ ...prev, [data.socketId]: data })); });
      newSocket.on("cursor-remove", (socketId) => { setCursors(prev => { const next = { ...prev }; delete next[socketId]; return next; }); });

      return () => { newSocket.disconnect(); };
    }
  }, [status, projectId, session]);

  const fetchProjectDetails = async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/workspace/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        if (data.assets?.length > 0 && !selectedAssetId) setSelectedAssetId(data.assets[0].id);
        else if (data.assets?.length === 0) setSelectedAssetId(null);
      }
    } catch (error) { console.error("Error fetching project", error); } 
    finally { setIsLoading(false); }
  };

  const assetStacks = useMemo(() => {
    if (!project?.assets) return {};
    const groups: Record<string, any[]> = {};
    project.assets.forEach((asset: any) => {
      if (!groups[asset.fileName]) groups[asset.fileName] = [];
      groups[asset.fileName].push(asset);
    });
    Object.values(groups).forEach(arr => arr.sort((a, b) => b.version - a.version));
    return groups;
  }, [project?.assets]);

  const activeAsset = project?.assets?.find((a: any) => a.id === selectedAssetId) || project?.assets?.[0] || null;
  const assetType = getAssetType(activeAsset?.fileUrl);
  const isSpatialAsset = assetType === 'image' || assetType === 'video' || assetType === 'code' || assetType === 'pdf';
  const isLocked = project?.status === 'APPROVED';
  const activeAssetStack = activeAsset ? assetStacks[activeAsset.fileName] : null;
  const previousAsset = activeAssetStack?.find((a: any) => a.version < activeAsset.version) || activeAssetStack?.[activeAssetStack.length - 1];
  const currentUserId = (session?.user as any)?.id;
  const isOwner = Boolean(project?.ownerId && currentUserId === project.ownerId);

  useEffect(() => { if (activeAsset) setIsMediaLoading(true); }, [activeAsset?.id]);

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchProjectDetails();
    } catch (error) { console.error("Failed to update status", error); }
  };

  const handleRenameProject = async () => {
    if (!editTitleText.trim() || editTitleText === project?.title) { setIsEditingTitle(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitleText }),
      });
      if (res.ok) { setProject({ ...project, title: editTitleText }); setIsEditingTitle(false); } 
      else { setErrorToast("Failed to rename project."); setTimeout(() => setErrorToast(""), 4000); }
    } catch (error) { console.error(error); }
  };

  const handleToggleDownloadUnlock = async (isUnlocked: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDownloadUnlocked: isUnlocked }),
      });
      if (res.ok) fetchProjectDetails();
      else { setErrorToast("Failed to update download permissions."); setTimeout(() => setErrorToast(""), 4000); }
    } catch (error) { console.error("Failed to toggle download", error); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData(); formData.append("file", file);
    if (uploadingToFileName) formData.append("fileNameOverride", uploadingToFileName);

    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/assets`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        await fetchProjectDetails();
        setSelectedAssetId(data.id); setScale(1); setPosition({ x: 0, y: 0 }); setIsCompareMode(false); 
      } else {
        const errorData = await res.json(); setErrorToast(errorData.error || "Upload failed."); setTimeout(() => setErrorToast(""), 4000);
      }
    } catch (error) { console.error("Upload error", error); } 
    finally { 
      setIsUploading(false); setUploadingToFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = ""; 
      if (versionFileInputRef.current) versionFileInputRef.current.value = ""; 
    }
  };

  const handleRenameAsset = async (assetId: string) => {
    if (!editAssetText.trim()) { setEditingAssetId(null); return; }
    try {
      const res = await fetch(`${API_URL}/api/assets/${assetId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: editAssetText }),
      });
      if (res.ok) { await fetchProjectDetails(); setEditingAssetId(null); }
      else { setErrorToast("Failed to rename asset."); setTimeout(() => setErrorToast(""), 4000); }
    } catch (error) { console.error(error); }
  };

  const executeDelete = async () => {
    if (!confirmDialog.type || !confirmDialog.targetId) return;
    try {
      if (confirmDialog.type === 'asset') {
        await fetch(`${API_URL}/api/assets/${confirmDialog.targetId}`, { method: "DELETE" });
        if (selectedAssetId === confirmDialog.targetId) setSelectedAssetId(null);
        setIsCompareMode(false); await fetchProjectDetails();
      } else if (confirmDialog.type === 'comment') {
        await fetch(`${API_URL}/api/comments/${confirmDialog.targetId}`, { method: "DELETE" });
        await fetchProjectDetails(); 
      }
    } catch (error) { console.error(`Failed to delete`, error); } 
    finally { setConfirmDialog({ isOpen: false, type: null, targetId: "", title: "", message: "" }); }
  };

  const requestAssetDelete = (assetId: string, e: MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({ isOpen: true, type: 'asset', targetId: assetId, title: "Delete File?", message: "This will permanently delete this file and all its versions." });
  };

  const requestCommentDelete = (commentId: string, e: MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({ isOpen: true, type: 'comment', targetId: commentId, title: "Delete Pin?", message: "Are you sure you want to permanently remove this feedback?" });
  };

  const filteredComments = activeAsset?.comments?.filter((comment: any) => {
    if (isCompareMode) return false; 
    const isDesignerComment = comment.authorId === project?.ownerId;
    if (activeTab === "CLIENT" && isDesignerComment) return false;
    if (activeTab === "DESIGNER" && !isDesignerComment) return false;
    return true;
  }) || [];

  const generateAISummary = async () => {
    if (aiCooldown > 0) return; 
    if (filteredComments.length === 0) { setErrorToast("No feedback found to summarize."); setTimeout(() => setErrorToast(""), 4000); return; }
    setIsSummarizing(true); setAiSummary(null);

    const textComments = filteredComments.map((c: any) => parseComment(c.text).text).filter((t: string) => t.trim() !== "");
    if (textComments.length === 0) { setErrorToast("No text feedback found."); setTimeout(() => setErrorToast(""), 4000); setIsSummarizing(false); return; }

    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/summary`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: textComments, requestorRole: isOwner ? "DESIGNER" : "CLIENT" }),
      });
      const data = await res.json();
      if (res.ok) setAiSummary(data.summary);
      else if (res.status === 429) {
        setErrorToast("AI Engine Limit Reached. Try again later."); setTimeout(() => setErrorToast(""), 4000);
        setAiCooldown(60);
        const countdown = setInterval(() => { setAiCooldown((prev) => { if (prev <= 1) { clearInterval(countdown); return 0; } return prev - 1; }); }, 1000);
      } else { setErrorToast(data.error || "AI Engine connection failed."); setTimeout(() => setErrorToast(""), 4000); }
    } catch (error) { console.error("AI Error:", error); } finally { setIsSummarizing(false); }
  };

  useEffect(() => {
    if (activeAsset && assetType === 'code') {
      fetch(activeAsset.fileUrl).then(res => res.text()).then(text => { setCodeContent(text); setIsMediaLoading(false); })
        .catch(() => { setCodeContent("// Error: Could not load code file."); setIsMediaLoading(false); });
    } else { setCodeContent(null); }
  }, [activeAsset, assetType]);

  const MemoizedCodeViewer = useMemo(() => {
    if (assetType !== 'code') return null;
    if (codeContent === null) return <div className="text-zinc-500 font-mono text-sm p-10">Loading source code...</div>;
    return (
      <div className="pointer-events-none text-[13px] w-full">
        <SyntaxHighlighter language={getCodeLanguage(activeAsset?.fileUrl || '')} style={vscDarkPlus} customStyle={{ background: 'transparent', margin: 0, padding: '20px' }} wrapLongLines={true}>{codeContent}</SyntaxHighlighter>
      </div>
    );
  }, [codeContent, activeAsset?.fileUrl, assetType]);

  useEffect(() => {
    if (assetType === 'pdf' && pdfPages > 0 && !isPdfScrubbing.current && assetRef.current) {
      const totalHeight = assetRef.current.scrollHeight;
      const averagePageHeight = totalHeight / pdfPages;
      const scrolledY = -position.y;
      const triggerOffset = typeof window !== 'undefined' ? window.innerHeight / 2 : 500;
      const estimatedPage = Math.max(1, Math.min(pdfPages, Math.floor((scrolledY + triggerOffset) / (averagePageHeight * scale)) + 1));
      if (estimatedPage !== pdfCurrentPage) { setPdfCurrentPage(estimatedPage); setPdfInputValue(estimatedPage.toString()); }
    }
  }, [position.y, scale, assetType, pdfPages, pdfCurrentPage]);

  const jumpToPdfPage = (page: number) => {
    const p = Math.max(1, Math.min(pdfPages, page)); setPdfCurrentPage(p); setPdfInputValue(p.toString());
    const el = document.getElementById(`pdf-page-${p}`);
    if (el && el.offsetTop > 0) { setPosition(prev => ({ ...prev, y: -(el.offsetTop * scale) })); } 
    else {
      const p1 = document.getElementById('pdf-page-1');
      const pageHeight = (p1 && p1.offsetHeight > 100) ? p1.offsetHeight : 1100;
      setPosition(prev => ({ ...prev, y: -((p - 1) * pageHeight * scale) }));
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isPdfScrubbing.current = true; setTimeout(() => isPdfScrubbing.current = false, 300); jumpToPdfPage(Number(e.target.value));
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (isCompareMode) return; e.preventDefault(); 
    if (!project?.assets?.length) return;
    if (e.shiftKey) { setScale(Math.min(Math.max(0.2, scale + (-e.deltaY * 0.002)), 5)); } 
    else { setPosition(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY })); }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCompareMode || e.button !== 0 || pendingPin) return; 
    setIsDragging(true); isMoved.current = false; dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleGlobalPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) { isMoved.current = true; setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }); }
    if (isDraggingSlider && compareContainerRef.current) {
      const rect = compareContainerRef.current.getBoundingClientRect();
      let pos = ((e.clientX - rect.left) / rect.width) * 100; setCompareSliderPos(Math.max(0, Math.min(100, pos))); 
    }
    if (!socket || !session?.user) return;
    const now = Date.now();
    if (now - lastEmit.current > 50) {
      socket.emit('cursor-move', { projectId, x: e.clientX, y: e.clientY, name: session.user.name || 'Guest', color: myColor });
      lastEmit.current = now;
    }
  };

  const handlePointerUp = () => { setIsDragging(false); setIsDraggingSlider(false); };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isCompareMode) return;
    if (e.touches.length === 2) {
      setIsDragging(false); isMoved.current = true; 
      initialTouchDist.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      initialPinchScale.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isCompareMode) return;
    if (e.touches.length === 2 && initialTouchDist.current > 0) {
      const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setScale(Math.min(Math.max(0.2, initialPinchScale.current * (currentDist / initialTouchDist.current)), 5));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => { if (e.touches.length < 2) initialTouchDist.current = 0; };

  const handleImageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isLocked || isCompareMode) return; 
    if (isMoved.current || !isSpatialAsset) { isMoved.current = false; return; }
    if (pendingPin) { clearPendingPin(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setPendingPin({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  };

  const handleCardClick = (comment: any, timestamp: number | null) => {
    setActivePinId(comment.id);
    if (isCompareMode) setIsCompareMode(false);
    if (assetType === 'video' && videoRef.current && timestamp !== null) videoRef.current.currentTime = timestamp;
    if (assetRef.current && comment.xPos !== 0 && comment.yPos !== 0) {
      const w = assetRef.current.clientWidth; const h = assetRef.current.clientHeight;
      let panX = ((50 - comment.xPos) / 100) * w * scale; let panY = 0;
      if (assetType === 'pdf' || assetType === 'code') {
        const viewportHalfHeight = typeof window !== 'undefined' ? window.innerHeight / 2 : 500;
        panY = -((comment.yPos / 100) * h * scale) + viewportHalfHeight;
      } else { panY = ((50 - comment.yPos) / 100) * h * scale; }
      setPosition({ x: panX, y: panY });
    }
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 5));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.2));
  const handleResetZoom = () => { setPosition(prev => ({ x: 0, y: (assetType === 'pdf' || assetType === 'code') ? prev.y * (1 / scale) : 0 })); setScale(1); };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; 
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        setAudioBlob(new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' }));
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      };

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true; recognition.interimResults = true;
        recognition.onresult = (event: any) => setCommentText(Array.from(event.results).map((r: any) => r[0].transcript).join(''));
        recognition.start(); recognitionRef.current = recognition;
      }

      mediaRecorder.start(); setIsRecording(true); setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (error) { setErrorToast("Microphone access denied."); setTimeout(() => setErrorToast(""), 4000); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false); clearInterval(timerRef.current);
    }
  };

  const discardAudio = () => {
    setAudioBlob(null); setRecordingTime(0);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
  };

  const clearPendingPin = () => { setPendingPin(null); setCommentText(""); discardAudio(); };

  const handleSaveComment = async (e: MouseEvent) => {
    e.stopPropagation();
    let finalAudioBlob = audioBlob;

    if (isRecording && mediaRecorderRef.current) {
      setIsSavingComment(true); 
      finalAudioBlob = await new Promise<Blob>((resolve) => {
        mediaRecorderRef.current!.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current!.mimeType || 'audio/webm' });
          setAudioBlob(blob);
          if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
          resolve(blob);
        };
        mediaRecorderRef.current!.stop();
        if (recognitionRef.current) recognitionRef.current.stop();
        setIsRecording(false); clearInterval(timerRef.current);
      });
    }

    if ((!commentText.trim() && !finalAudioBlob) || !activeAsset) { setIsSavingComment(false); return; }
    setIsSavingComment(true);

    let uploadedAudioUrl = null;
    if (finalAudioBlob) {
      const formData = new FormData(); formData.append('audio', finalAudioBlob, 'voice-note.webm');
      try {
        const uploadRes = await fetch(`${API_URL}/api/upload-audio`, { method: 'POST', body: formData });
        if (uploadRes.ok) uploadedAudioUrl = (await uploadRes.json()).fileUrl;
      } catch (err) { console.error("Audio upload failed", err); }
    }

    let finalCommentText = commentText;
    if ((assetType === 'video' && videoRef.current) || uploadedAudioUrl) {
      const payload: any = { t: commentText };
      if (assetType === 'video' && videoRef.current) payload.ts = videoRef.current.currentTime;
      if (uploadedAudioUrl) payload.audioUrl = uploadedAudioUrl;
      finalCommentText = JSON.stringify(payload);
    }

    try {
      const res = await fetch(`${API_URL}/api/assets/${activeAsset.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: finalCommentText, xPos: pendingPin?.x || 0, yPos: pendingPin?.y || 0, authorId: (session?.user as any).id, projectId }),
      });
      if (res.ok) clearPendingPin(); else { setErrorToast("Failed to save pin."); setTimeout(() => setErrorToast(""), 4000); }
    } catch (error) { console.error(error); } finally { setIsSavingComment(false); }
  };

  const handleUpdateComment = async (commentId: string, oldRawText: string) => {
    if (!editCommentText.trim()) return;
    const parsed = parseComment(oldRawText);
    const payload: any = { t: editCommentText };
    if (parsed.timestamp !== null) payload.ts = parsed.timestamp;
    if (parsed.audioUrl) payload.audioUrl = parsed.audioUrl;
    const newRawText = (payload.ts !== undefined || payload.audioUrl) ? JSON.stringify(payload) : editCommentText;

    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newRawText, projectId }),
      });
      if (res.ok) { setEditingCommentId(null); setEditCommentText(""); }
    } catch (error) { console.error(error); }
  };

  const handleToggleResolve = async (commentId: string, isCurrentlyResolved: boolean, e: MouseEvent) => {
    e.stopPropagation(); 
    try {
      await fetch(`${API_URL}/api/comments/${commentId}/resolve`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ projectId, isResolved: !isCurrentlyResolved }),
      });
    } catch (error) { console.error(error); }
  };

  const handleSendInvite = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsGeneratingLink(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/invite`, { 
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail, origin: window.location.origin })
      });
      if (res.ok) {
        const data = await res.json();
        if (!inviteEmail) {
           await navigator.clipboard.writeText(`${window.location.origin}/?projectId=${projectId}`);
           setCopySuccess(true); setTimeout(() => setCopySuccess(false), 3000);
        } else {
           setCopySuccess(true); setTimeout(() => { setCopySuccess(false); setIsInviteModalOpen(false); setInviteEmail(""); }, 2000);
        }
      }
    } catch (error) { console.error(error); } finally { setIsGeneratingLink(false); }
  };

  const handleDownloadFinalAsset = async () => {
    if (!activeAsset?.fileUrl) return;
    setIsDownloading(true);
    try {
      const response = await fetch(activeAsset.fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a'); a.style.display = 'none'; a.href = url; a.download = activeAsset.fileName || 'final-asset';
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (error) { setErrorToast("Failed to download asset."); setTimeout(() => setErrorToast(""), 4000); } 
    finally { setIsDownloading(false); }
  };

  const canDownload = isOwner || project?.isDownloadUnlocked;

  if (isLoading) {
    return <div className="fixed inset-0 flex items-center justify-center bg-[#050505] z-50 text-emerald-500 font-mono text-sm tracking-widest uppercase animate-pulse">Loading Workspace...</div>;
  }
  if (!project) return <div className="fixed inset-0 flex items-center justify-center bg-[#050505] text-white z-50">Workspace Not Found</div>;

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-[#050505] text-white overflow-hidden touch-none"
      onPointerMove={handleGlobalPointerMove} 
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      
      {isVersionMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsVersionMenuOpen(false)}></div>
      )}

      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-sm shadow-2xl max-w-sm w-full animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white font-bold text-lg tracking-tight">Invite Client</h3>
              <button onClick={() => setIsInviteModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">✕</button>
            </div>
            <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Client Email Address</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="client@company.com" className="w-full bg-[#111] border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none transition-colors" />
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <button type="submit" disabled={isGeneratingLink || !inviteEmail} className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-[#050505] font-bold text-xs rounded-sm tracking-widest uppercase transition-colors disabled:opacity-50">
                  {isGeneratingLink ? "Sending..." : copySuccess && inviteEmail ? "Sent!" : "Send Email Invite"}
                </button>
                <div className="relative flex items-center py-2">
                  <div className="grow border-t border-zinc-800"></div>
                  <span className="shrink-0 mx-4 text-zinc-600 text-[10px] uppercase font-bold tracking-widest">OR</span>
                  <div className="grow border-t border-zinc-800"></div>
                </div>
                <button type="button" onClick={() => handleSendInvite()} className="w-full py-2 bg-[#111] hover:bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-500 font-bold text-xs rounded-sm tracking-widest uppercase transition-colors">
                  {copySuccess && !inviteEmail ? "Copied to Clipboard!" : "Copy Invite Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {Object.entries(cursors).map(([id, cursor]) => (
        <div key={id} className="fixed pointer-events-none z-50 flex flex-col items-start transition-all duration-75 ease-linear" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={cursor.color} stroke="white" strokeWidth="1.5" className="drop-shadow-lg -ml-1 -mt-1"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87a.5.5 0 00.35-.85L5.5 3.21z" /></svg>
          <div className="bg-[#111] text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg border border-zinc-700 mt-1 whitespace-nowrap">{cursor.name}</div>
        </div>
      ))}

      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-sm shadow-2xl max-w-sm w-full animate-fade-in-up">
            <h3 className="text-white font-bold text-lg mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">Cancel</button>
              <button onClick={executeDelete} className="px-4 py-2 text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-[#050505] rounded-sm transition-colors uppercase tracking-widest">Delete</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .custom-range { -webkit-appearance: none; background: transparent; }
        .custom-range:focus { outline: none; }
        .custom-range::-webkit-slider-runnable-track { width: 100%; height: 4px; cursor: pointer; background: #27272a; border-radius: 2px; }
        .custom-range::-webkit-slider-thumb { height: 16px; width: 16px; border-radius: 50%; background: #10b981; cursor: pointer; -webkit-appearance: none; margin-top: -6px; box-shadow: 0 0 12px rgba(16, 185, 129, 0.6); transition: transform 0.15s ease-out; }
        .custom-range::-webkit-slider-thumb:hover { transform: scale(1.3); background: #34d399; }
        .custom-audio-player { outline: none; border-radius: 4px; color-scheme: dark; }
        .custom-audio-player::-webkit-media-controls-panel { background-color: #111; }
        .custom-audio-player::-webkit-media-controls-current-time-display, .custom-audio-player::-webkit-media-controls-time-remaining-display { color: #10b981; }
      `}} />

      {errorToast && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 border border-red-400 text-white px-6 py-2 rounded-sm text-xs font-bold tracking-widest shadow-2xl animate-fade-in-down">{errorToast}</div>}

      <header className="h-18 flex-none flex justify-between items-center px-4 md:px-6 border-b border-zinc-800 bg-[#050505] z-40 w-full relative">
        <div className="flex items-center gap-3 md:gap-5 min-w-0 flex-1 relative">
          <Link href="/" className="text-zinc-500 hover:text-white text-[10px] md:text-xs tracking-widest uppercase font-bold transition-colors shrink-0">&larr; Dash</Link>
          <div className="w-px h-6 bg-zinc-800 shrink-0 hidden md:block"></div>
          
          <button onClick={() => setIsAssetSidebarOpen(!isAssetSidebarOpen)} className={`p-2 rounded-sm transition-colors hidden md:block ${isAssetSidebarOpen ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`} title="Toggle File Manager">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
          
          <div className="flex items-center gap-3 min-w-0 flex-1 ml-2">
            {isEditingTitle && isOwner ? (
              <input autoFocus value={editTitleText} onChange={(e) => setEditTitleText(e.target.value)} onBlur={handleRenameProject} onKeyDown={(e) => e.key === 'Enter' && handleRenameProject()} className="bg-[#111] text-lg md:text-xl font-bold text-white tracking-tight border border-emerald-500 rounded-sm px-2 py-1 outline-none w-full max-w-75"/>
            ) : (
              <h1 onClick={() => { if(isOwner) { setEditTitleText(project?.title); setIsEditingTitle(true); } }} className={`text-lg md:text-xl font-bold text-white tracking-tight truncate ${isOwner ? 'cursor-text hover:text-zinc-300 transition-colors' : ''}`} title={isOwner ? "Click to rename project" : project?.title}>{project?.title}</h1>
            )}
            <span className={`hidden md:inline-block text-[9px] px-2 py-1 font-mono uppercase tracking-wider rounded-sm font-bold shrink-0 ${isOwner ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30" : "bg-blue-500/15 text-blue-500 border border-blue-500/30"}`}>{isOwner ? "Designer" : "Client"}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4 shrink-0 pl-2">
          
          {activeUsers.length > 0 && (
            <div className="hidden md:flex items-center -space-x-2 mr-2 border-r border-zinc-800 pr-4">
              {activeUsers.map((user, i) => {
                const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
                const charCodeSum = user.name ? user.name.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0) : 0;
                const colorClass = colors[charCodeSum % colors.length];

                return (
                  <div key={i} className={`w-7 h-7 rounded-full border-2 border-[#050505] flex items-center justify-center text-[9px] font-bold text-[#050505] shadow-sm z-10 ${colorClass}`} title={user.name + (user.email === session?.user?.email ? " (You)" : "")}>
                    {(user.name || 'G').substring(0, 2).toUpperCase()}
                  </div>
                );
              })}
            </div>
          )}

          {canDownload && activeAsset && project?.status === 'APPROVED' && (
            <div className="flex items-center border-r border-zinc-800 pr-4 mr-2">
              <button onClick={handleDownloadFinalAsset} disabled={isDownloading} className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-[#050505] rounded-sm font-bold text-[10px] md:text-xs tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0 disabled:opacity-50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {isDownloading ? "Downloading..." : "Download Final"}
              </button>
            </div>
          )}

          {!isOwner && !isLocked && (
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-4 mr-2">
              <button onClick={() => handleUpdateStatus('CHANGES_REQUESTED')} className="px-3 py-1.5 text-[9px] font-bold tracking-widest uppercase bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-sm hover:bg-rose-500 hover:text-[#050505] transition-colors">Request Changes</button>
              <button onClick={() => handleUpdateStatus('APPROVED')} className="px-3 py-1.5 text-[9px] font-bold tracking-widest uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 rounded-sm hover:bg-emerald-500 hover:text-[#050505] transition-colors shadow-[0_0_10px_rgba(16,185,129,0.3)]">Approve</button>
            </div>
          )}

          {isOwner && isLocked && (
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-4 mr-2">
              <button onClick={() => handleToggleDownloadUnlock(!project?.isDownloadUnlocked)} className={`px-3 py-1.5 text-[9px] font-bold tracking-widest uppercase rounded-sm transition-colors ${project?.isDownloadUnlocked ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500 hover:text-[#050505]' : 'bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500 hover:text-[#050505]'}`}>
                {project?.isDownloadUnlocked ? '🔒 Revoke Access' : '🔓 Unlock for Client'}
              </button>
              <button onClick={() => handleUpdateStatus('IN_REVIEW')} className="px-3 py-1.5 text-[9px] font-bold tracking-widest uppercase bg-zinc-800 text-white rounded-sm hover:bg-zinc-700 transition-colors">Re-Open Project</button>
            </div>
          )}

          {activeAssetStack && activeAssetStack.length > 1 && assetType === 'image' && (
            <button onClick={() => setIsCompareMode(!isCompareMode)} className={`flex items-center gap-2 px-3 py-1.5 rounded-sm transition-colors border ${isCompareMode ? 'bg-emerald-500 border-emerald-500 text-[#050505]' : 'bg-[#0a0a0a] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              <span className="text-[10px] font-bold uppercase tracking-widest">{isCompareMode ? 'Exit Compare' : 'Compare'}</span>
            </button>
          )}

          {activeAssetStack && activeAssetStack.length > 0 && (
            <div className="relative z-40">
              <button onClick={() => setIsVersionMenuOpen(!isVersionMenuOpen)} className="relative z-40 flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors">
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">v{activeAsset?.version}</span>
                <span className="text-[10px] text-zinc-500">▾</span>
              </button>

              {isVersionMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsVersionMenuOpen(false); }}></div>
                  <div className="absolute top-full right-0 mt-2 w-56 bg-[#050505] border border-zinc-800 rounded-sm shadow-2xl overflow-hidden z-50 flex flex-col">
                    <div className="p-2 border-b border-zinc-800 bg-[#0a0a0a]">
                      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Version History</span>
                    </div>
                    <div className="max-h-50 overflow-y-auto no-scrollbar">
                      {activeAssetStack.map((asset: any, index: number) => {
                        const isLatest = index === 0;
                        const isCurrentlyViewing = selectedAssetId === asset.id;
                        return (
                          <button key={asset.id} onClick={() => { setSelectedAssetId(asset.id); setIsVersionMenuOpen(false); setIsCompareMode(false); setScale(1); setPosition({x:0, y:0}); }} className={`w-full text-left p-3 text-xs flex justify-between items-center transition-colors ${isCurrentlyViewing ? 'bg-zinc-900 text-white border-l-2 border-emerald-500' : 'text-zinc-400 hover:bg-[#0a0a0a] border-l-2 border-transparent'}`}>
                            <span className="font-mono font-bold">Version {asset.version}</span>
                            {isLatest && <span className="text-[9px] text-emerald-500 uppercase tracking-widest">Latest</span>}
                          </button>
                        );
                      })}
                    </div>
                    {isOwner && !isLocked && (
                      <button onClick={() => { setUploadingToFileName(activeAsset.fileName); versionFileInputRef.current?.click(); setIsVersionMenuOpen(false); }} className="w-full p-3 text-left text-[10px] text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400 font-bold uppercase tracking-widest border-t border-zinc-800 transition-colors border-dashed">
                        + Upload New Version
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {isSpatialAsset && activeAsset && !isCompareMode && (
            <div className="flex items-center px-2 md:px-3 py-1 bg-[#0a0a0a] border border-zinc-800 rounded-sm gap-1 md:gap-2 shrink-0 md:mr-2 shadow-inner">
              <span className="hidden md:inline text-[9px] text-zinc-500 font-mono uppercase tracking-widest border-r border-zinc-800 pr-3 mr-1">Zoom</span>
              <button onClick={handleZoomOut} className="text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-sm w-6 h-6 flex items-center justify-center transition-colors font-mono leading-none">-</button>
              <div className="text-[10px] font-mono font-bold text-zinc-300 min-w-9 text-center">{Math.round(scale * 100)}%</div>
              <button onClick={handleZoomIn} className="text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-sm w-6 h-6 flex items-center justify-center transition-colors font-mono leading-none">+</button>
              <div className="w-px h-3 bg-zinc-800 mx-1"></div>
              <button onClick={handleResetZoom} className="text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-sm px-2 h-6 flex items-center justify-center transition-colors text-[9px] uppercase tracking-widest font-bold">Fit</button>
            </div>
          )}

          <div className="flex items-center px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 text-zinc-400 text-[9px] md:text-[10px] font-bold rounded-sm tracking-widest shrink-0">
            <span className="hidden md:inline">STATUS: </span>
            <span className={`${project?.status === 'APPROVED' ? 'text-emerald-500' : project?.status === 'CHANGES_REQUESTED' ? 'text-rose-500' : 'text-indigo-400'} md:ml-2`}>{project?.status?.replace("_", " ")}</span>
          </div>
          
          {isOwner && (
            <button onClick={() => setIsInviteModalOpen(true)} className="px-3 md:px-4 py-1.5 font-bold rounded-sm transition-all duration-300 text-[10px] md:text-xs tracking-widest flex items-center justify-center w-24 md:w-32 shrink-0 bg-zinc-100 text-[#050505] hover:bg-white shadow-lg">
              SHARE LINK
            </button>
          )}
        </div>
      </header>

      {activeAssetStack && activeAssetStack[0].id !== activeAsset?.id && !isCompareMode && (
        <div className="w-full bg-amber-500/10 text-amber-500 text-[10px] font-bold tracking-widest uppercase py-2 flex justify-center items-center gap-2 border-b border-amber-500/20 z-20">
          ⚠️ You are viewing an older version (v{activeAsset?.version}).
          <button onClick={() => { setSelectedAssetId(activeAssetStack[0].id); setScale(1); setPosition({x:0,y:0}); }} className="underline hover:text-amber-400 ml-2">
            Go to Latest (v{activeAssetStack[0].version})
          </button>
        </div>
      )}

      <input type="file" accept="image/*,video/*,audio/*,application/pdf,text/*,.js,.ts,.tsx,.json,.css,.html,.py,.md" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      <input type="file" accept="image/*,video/*,audio/*,application/pdf,text/*,.js,.ts,.tsx,.json,.css,.html,.py,.md" className="hidden" ref={versionFileInputRef} onChange={handleFileUpload} />

      <main className="flex-1 flex min-h-0 relative">
        
        <aside className={`bg-[#080808] border-r border-zinc-800 flex flex-col transition-all duration-300 overflow-hidden shrink-0 ${isAssetSidebarOpen ? 'w-72' : 'w-0 border-r-0'}`}>
          <div className="p-5 flex justify-between items-center border-b border-zinc-800 shrink-0">
            <h2 className="text-zinc-300 text-xs tracking-widest uppercase font-bold">Project Files</h2>
            <span className="text-zinc-500 text-[10px] font-mono bg-zinc-900 px-2 py-1 rounded-sm">{Object.keys(assetStacks).length || 0}</span>
          </div>
          
          <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-4">
            {Object.keys(assetStacks).length === 0 ? (
              <div className="text-center text-zinc-600 text-xs mt-10 font-mono">No files uploaded.</div>
            ) : (
              assetCategories.map(category => {
                const categoryLatestAssets = Object.values(assetStacks).map(stack => stack[0]).filter((a: any) => {
                  const type = getAssetType(a.fileUrl);
                  if (category.id === 'video' || category.id === 'audio') return type === 'video' || type === 'audio';
                  return type === category.id;
                });

                if (categoryLatestAssets.length === 0 || (category.id === 'audio' && categoryLatestAssets.length > 0)) return null;

                return (
                  <div key={category.id} className="space-y-1">
                    <h3 className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest px-2 mb-2">{category.title}</h3>
                    {categoryLatestAssets.map((asset: any) => {
                      const isActiveStack = activeAsset && activeAsset.fileName === asset.fileName;
                      const isEditingAsset = editingAssetId === asset.id;
                      const type = getAssetType(asset.fileUrl);

                      return (
                        <div key={asset.id} onClick={() => { if(!isEditingAsset) { setSelectedAssetId(asset.id); setIsCompareMode(false); setScale(1); setPosition({x:0, y:0}); } }} className={`group flex items-center justify-between p-2.5 rounded-sm cursor-pointer transition-all ${isActiveStack ? 'bg-zinc-900 border-l-2 border-l-emerald-500 shadow-md' : 'hover:bg-[#0a0a0a] border-l-2 border-l-transparent'}`}>
                          <div className="flex items-center gap-3 overflow-hidden w-full">
                            <div className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 text-xs ${isActiveStack ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-400'}`}>
                              {type === 'image' ? '🖼' : type === 'video' ? '🎬' : type === 'pdf' ? '📄' : type === 'code' ? '</>' : '🎵'}
                            </div>
                            <div className="flex flex-col truncate w-full pr-2">
                              {isEditingAsset && isOwner ? (
                                <input autoFocus value={editAssetText} onChange={(e) => setEditAssetText(e.target.value)} onBlur={() => handleRenameAsset(asset.id)} onKeyDown={(e) => e.key === 'Enter' && handleRenameAsset(asset.id)} onClick={(e) => e.stopPropagation()} className="text-[12px] bg-[#111] border border-emerald-500 text-white rounded-sm px-1 outline-none w-full"/>
                              ) : (
                                <span onDoubleClick={(e) => { e.stopPropagation(); if (isOwner && !isLocked) { setEditingAssetId(asset.id); setEditAssetText(asset.fileName); } }} className={`text-[12px] truncate font-medium ${isActiveStack ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`} title={isOwner && !isLocked ? "Double-click to rename" : asset.fileName}>{asset.fileName}</span>
                              )}
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-zinc-600 font-mono uppercase">{type}</span>
                                {asset.version > 1 && <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1 rounded-sm font-bold">v{asset.version}</span>}
                              </div>
                            </div>
                          </div>
                          
                          {isOwner && !isEditingAsset && !isLocked && (
                            <div className={`flex items-center gap-1 transition-opacity ${isActiveStack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              <button onClick={(e) => requestAssetDelete(asset.id, e)} className="text-zinc-500 hover:text-red-500 p-1.5 transition-colors" title="Delete Stack">✕</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
          
          {isOwner && !isLocked && (
            <div className="p-4 border-t border-zinc-800 bg-[#050505] shrink-0">
              <button onClick={() => fileInputRef.current?.click()} className="w-full py-2.5 bg-[#0a0a0a] hover:bg-white border border-zinc-800 hover:border-white rounded-sm text-zinc-400 hover:text-[#050505] text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
                <span>+</span> Upload File
              </button>
            </div>
          )}
        </aside>

        {/* --- CENTER AREA: THE INTERACTIVE CANVAS --- */}
        <div 
          className="flex-1 min-w-0 flex bg-[#0a0a0a] relative overflow-hidden touch-none"
          onWheel={isSpatialAsset && !isCompareMode ? handleWheel : undefined}
          onPointerDown={isSpatialAsset && !isCompareMode ? handlePointerDown : undefined}
          onTouchStart={isSpatialAsset && !isCompareMode ? handleTouchStart : undefined}
          onTouchMove={isSpatialAsset && !isCompareMode ? handleTouchMove : undefined}
          onTouchEnd={isSpatialAsset && !isCompareMode ? handleTouchEnd : undefined}
        >
          {activeAsset ? (
            <>
              {isCompareMode && assetType === 'image' && previousAsset ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 relative select-none">
                  <div ref={compareContainerRef} className="relative w-full max-w-[90vw] max-h-[85vh] shadow-2xl border border-zinc-800 bg-[#050505] flex justify-center overflow-hidden" style={{ aspectRatio: 'auto' }}>
                    <img src={previousAsset.fileUrl} className="block w-full h-full object-contain pointer-events-none" />
                    <img src={activeAsset.fileUrl} className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none" style={{ clipPath: `polygon(0 0, ${compareSliderPos}% 0, ${compareSliderPos}% 100%, 0 100%)` }} />
                    <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 cursor-ew-resize flex items-center justify-center hover:bg-emerald-400 transition-colors z-50 shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ left: `${compareSliderPos}%` }} onPointerDown={(e) => { e.stopPropagation(); setIsDraggingSlider(true); }}>
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg text-[#050505] text-xs font-bold ring-4 ring-[#050505]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3"/></svg>
                      </div>
                    </div>
                    <div className="absolute top-4 left-4 bg-[#050505] text-zinc-400 text-[10px] font-mono px-3 py-1.5 rounded-sm border border-zinc-800 shadow-lg">v{previousAsset.version} (Before)</div>
                    <div className="absolute top-4 right-4 bg-emerald-500 text-[#050505] font-bold text-[10px] font-mono px-3 py-1.5 rounded-sm shadow-lg">v{activeAsset.version} (After)</div>
                  </div>
                </div>
              ) : (
                <div 
                  className={`w-full h-full flex justify-center ${(assetType === 'pdf' || assetType === 'code') ? 'items-start pt-12' : 'items-center'} ${isDragging ? "cursor-grabbing" : isSpatialAsset && !isLocked ? 'cursor-grab' : ''}`}
                  style={{ transform: isSpatialAsset ? `translate(${position.x}px, ${position.y}px) scale(${scale})` : 'none', transformOrigin: (assetType === 'pdf' || assetType === 'code') ? 'top center' : 'center center', transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)', willChange: 'transform' }}
                >
                  <div ref={assetRef} className={`relative inline-block shadow-2xl ${isSpatialAsset && !isLocked ? 'cursor-crosshair' : 'cursor-default w-full h-full'}`} onClick={(e) => handleImageClick(e)}>
                    
                    {isMediaLoading && (assetType === 'image' || assetType === 'video' || assetType === 'pdf') && (
                        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none bg-[#050505]/50 backdrop-blur-sm">
                            <div className="w-12 h-12 border-4 border-zinc-800 border-t-emerald-500 rounded-full animate-spin shadow-lg"></div>
                        </div>
                    )}

                    {assetType === 'image' && <img src={activeAsset.fileUrl} alt="Design Asset" fetchPriority="high" onLoad={() => setIsMediaLoading(false)} className={`block object-contain pointer-events-none border border-zinc-800 bg-[#050505] transition-opacity duration-300 ${isMediaLoading ? 'opacity-0' : 'opacity-100'}`} style={{ maxHeight: '85vh', maxWidth: '90vw' }} />}
                    {assetType === 'video' && <video ref={videoRef} src={activeAsset.fileUrl} controls onLoadedData={() => setIsMediaLoading(false)} className={`block border border-zinc-800 bg-[#050505] transition-opacity duration-300 ${isMediaLoading ? 'opacity-0' : 'opacity-100'}`} style={{ maxHeight: '85vh', maxWidth: '90vw' }} onTimeUpdate={() => setCurrentVideoTime(videoRef.current?.currentTime || 0)} />}
                    {assetType === 'audio' && <div className="flex flex-col items-center justify-center w-96 bg-[#050505] border border-zinc-800 p-8 rounded-sm mx-auto mt-32 shadow-2xl"><div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-3xl mb-6">🎵</div><audio src={activeAsset.fileUrl} controls className="w-full custom-audio-player" /></div>}
                    {assetType === 'pdf' && <div className="border border-zinc-800 shadow-2xl relative pointer-events-none bg-[#050505]"><DynamicPdfEngine fileUrl={activeAsset.fileUrl} onLoad={(pages: number) => { setPdfPages(pages); setIsMediaLoading(false); }} /></div>}
                    {assetType === 'code' && <div className="relative min-w-200 h-auto bg-[#050505] border border-zinc-800 text-left shadow-2xl overflow-hidden p-6">{MemoizedCodeViewer}</div>}
                    {assetType === 'unknown' && <div className="flex flex-col items-center justify-center bg-[#050505] border border-zinc-800 p-10 rounded-sm mx-auto mt-32"><div className="text-4xl mb-4">📄</div><p className="text-zinc-400 font-mono text-sm mb-6 tracking-widest uppercase">Unsupported Format</p><a href={activeAsset.fileUrl} download target="_blank" className="bg-emerald-500 text-[#050505] font-bold px-6 py-2 rounded-sm text-xs tracking-widest hover:bg-emerald-400">DOWNLOAD</a></div>}

                    {isSpatialAsset && filteredComments.map((comment: any, index: number) => {
                      const parsed = parseComment(comment.text);
                      const isDesignerComment = comment.authorId === project?.ownerId;
                      const pinColor = isDesignerComment ? "bg-blue-500" : "bg-emerald-500";
                      const isActive = activePinId === comment.id;
                      if (assetType === 'video' && parsed.timestamp !== null) {
                        if (Math.abs(currentVideoTime - parsed.timestamp) > 1.5 && !isActive) return null;
                      }
                      return (
                        <div key={comment.id} className={`absolute ${isActive ? 'z-50' : 'z-10'}`} style={{ left: `${comment.xPos}%`, top: `${comment.yPos}%`, width: '28px', height: '28px', transform: `translate(-50%, -50%) scale(${1 / scale})` }}>
                          <div className={`w-full h-full ${pinColor} rounded-full border-[1.5px] border-[#050505] cursor-pointer group flex items-center justify-center transition-all duration-300 ease-out ${isActive ? 'scale-[1.8] ring-4 ring-white/50 shadow-[0_0_30px_rgba(255,255,255,0.5)]' : 'hover:scale-110 shadow-lg'}`}>
                            <span className={`font-bold text-[#050505] pointer-events-none transition-all ${isActive ? 'text-[8px]' : 'text-[10px]'}`}>{index + 1}</span>
                            
                            <div className={`absolute transition-opacity bottom-full left-1/2 transform -translate-x-1/2 mb-4 bg-[#050505] border border-zinc-700 px-4 py-2 text-sm font-medium text-white rounded-sm whitespace-nowrap z-20 pointer-events-none shadow-2xl ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              {parsed.audioUrl ? (
                                <div className="flex flex-col gap-1">
                                  <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${isDesignerComment ? 'text-blue-500' : 'text-emerald-500'}`}>
                                     🎤 Voice Note
                                  </span>
                                  {parsed.text && <span className="text-zinc-400 italic text-xs truncate max-w-50">"{parsed.text}"</span>}
                                </div>
                              ) : (
                                parsed.text
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {pendingPin && isSpatialAsset && !isLocked && (
                      <div className="absolute z-30" style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%`, width: '28px', height: '28px', transform: `translate(-50%, -50%) scale(${1 / scale})` }}>
                        <div className={`w-full h-full rounded-full border-[1.5px] border-[#050505] shadow-lg animate-bounce ${isOwner ? "bg-blue-500" : "bg-emerald-500"}`} />
                        <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-[#050505] border border-zinc-700 p-4 rounded-sm shadow-2xl w-72 cursor-default" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                          
                          {isRecording ? (
                            <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/30 rounded-sm p-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                                <span className="text-xs text-rose-500 font-mono">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                              </div>
                              <button onClick={stopRecording} className="w-6 h-6 flex items-center justify-center bg-rose-500 text-[#050505] rounded-sm hover:bg-rose-400 transition-colors">■</button>
                            </div>
                          ) : audioBlob ? (
                            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-sm p-2 mb-2">
                              <audio src={URL.createObjectURL(audioBlob)} controls className="w-full custom-audio-player" />
                              <button onClick={discardAudio} className="w-6 h-6 shrink-0 flex items-center justify-center text-rose-500 hover:bg-rose-500/20 rounded-sm transition-colors">✕</button>
                            </div>
                          ) : null}

                          <textarea className="w-full bg-[#0a0a0a] text-white border border-zinc-700 rounded-sm p-3 text-sm focus:border-emerald-500 focus:outline-none resize-none shadow-inner" rows={3} autoFocus placeholder={isOwner ? "Drop a designer note..." : "Leave your feedback..."} value={commentText} onChange={(e) => setCommentText(e.target.value)} />
                          
                          <div className="flex justify-between items-center mt-3">
                            <button onClick={startRecording} disabled={isRecording || audioBlob !== null} className={`text-zinc-500 transition-colors ${isRecording || audioBlob ? 'opacity-50 cursor-not-allowed' : 'hover:text-emerald-500'}`} title="Record Voice Note">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                            </button>

                            <div className="flex justify-end gap-3">
                              <button onClick={(e) => { e.stopPropagation(); clearPendingPin(); }} className="text-[10px] text-zinc-400 hover:text-white font-bold tracking-widest transition-colors uppercase">Cancel</button>
                              <button onClick={handleSaveComment} disabled={isSavingComment || (!commentText.trim() && !audioBlob && !isRecording)} className={`text-[10px] text-[#050505] px-4 py-1.5 font-bold uppercase tracking-widest rounded-sm disabled:opacity-50 transition-colors shadow-sm ${isOwner ? "bg-blue-500 hover:bg-blue-400" : "bg-emerald-500 hover:bg-emerald-400"}`}>{isSavingComment ? "..." : "Save Pin"}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            isOwner ? (
              <div className="flex-1 w-full h-full flex flex-col items-center justify-center text-zinc-500 font-mono tracking-widest text-sm">
                 <div className="w-16 h-16 border-2 border-dashed border-zinc-800 rounded-full mb-4 flex items-center justify-center text-2xl">+</div>
                 <div className="text-zinc-500 mb-2 uppercase">Workspace is Empty</div>
                 <button onClick={() => fileInputRef.current?.click()} className="mt-4 px-6 py-2 bg-[#0a0a0a] hover:bg-white text-zinc-400 hover:text-[#050505] border border-zinc-800 hover:border-white transition-all rounded-sm font-bold text-[10px] tracking-widest uppercase">Upload First File</button>
              </div>
            ) : (
              <div className="flex-1 w-full h-full flex flex-col items-center justify-center text-zinc-500 font-mono tracking-widest text-sm">
                <div className="w-16 h-16 border-2 border-zinc-800 rounded-full mb-4 flex items-center justify-center text-2xl animate-pulse">🕒</div>
                Waiting for Designer to upload an asset...
              </div>
            )
          )}
        </div>

        {/* --- RIGHT SIDEBAR: FEEDBACK & ACTIVITY --- */}
        <aside className="w-[320px] md:w-96 shrink-0 flex flex-col bg-[#050505] border-l border-zinc-800 z-10 shadow-2xl relative">
          
          <div className="shrink-0 border-b border-zinc-800 bg-[#0a0a0a] flex w-full">
            <button onClick={() => setRightSidebarTab("FEEDBACK")} className={`flex-1 py-4 text-[10px] tracking-widest uppercase font-bold transition-all border-b-2 ${rightSidebarTab === "FEEDBACK" ? "border-emerald-500 text-emerald-500 bg-[#111]" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#0f0f0f]"}`}>Feedback</button>
            <button onClick={() => setRightSidebarTab("ACTIVITY")} className={`flex-1 py-4 text-[10px] tracking-widest uppercase font-bold transition-all border-b-2 ${rightSidebarTab === "ACTIVITY" ? "border-emerald-500 text-emerald-500 bg-[#111]" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#0f0f0f]"}`}>Activity</button>
          </div>

          {rightSidebarTab === "FEEDBACK" && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
                <button onClick={generateAISummary} disabled={isSummarizing || filteredComments.length === 0 || aiCooldown > 0} className="group flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500 hover:text-[#050505] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(99,102,241,0.2)]" title="Generate Actionable Summary">
                  <svg className="w-3.5 h-3.5 group-hover:animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">{isSummarizing ? "Syncing..." : aiCooldown > 0 ? `Wait ${aiCooldown}s` : "AI Sync"}</span>
                </button>
                <span className="text-zinc-400 text-[10px] font-mono bg-[#0a0a0a] border border-zinc-800 px-3 py-1 rounded-sm font-bold">{filteredComments.length || 0}</span>
              </div>

              {activeAsset && (!isSpatialAsset) && !isLocked && !isCompareMode && (
                <div className="p-4 bg-[#0a0a0a] border-b border-zinc-800 shrink-0">
                  {isRecording ? (
                    <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/30 rounded-sm p-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                        <span className="text-xs text-rose-500 font-mono">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                      </div>
                      <button onClick={stopRecording} className="w-6 h-6 flex items-center justify-center bg-rose-500 text-[#050505] rounded-sm hover:bg-rose-400 transition-colors">■</button>
                    </div>
                  ) : audioBlob ? (
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-sm p-2 mb-2">
                      <audio src={URL.createObjectURL(audioBlob)} controls className="w-full custom-audio-player" />
                      <button onClick={discardAudio} className="w-6 h-6 shrink-0 flex items-center justify-center text-rose-500 hover:bg-rose-500/20 rounded-sm transition-colors">✕</button>
                    </div>
                  ) : null}

                  <textarea className="w-full bg-[#050505] text-white border border-zinc-700 rounded-sm p-3 text-sm focus:border-emerald-500 focus:outline-none resize-none shadow-inner mb-2" rows={3} placeholder="Leave document feedback..." value={commentText} onChange={(e) => setCommentText(e.target.value)} />
                  
                  <div className="flex justify-between items-center">
                    <button onClick={startRecording} disabled={isRecording || audioBlob !== null} className={`text-zinc-500 transition-colors ${isRecording || audioBlob ? 'opacity-50 cursor-not-allowed' : 'hover:text-emerald-500'}`} title="Record Voice Note">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </button>
                    <button onClick={handleSaveComment} disabled={isSavingComment || (!commentText.trim() && !audioBlob && !isRecording)} className={`text-[10px] text-[#050505] px-4 py-1.5 font-bold uppercase tracking-widest rounded-sm disabled:opacity-50 transition-colors shadow-sm ${isOwner ? "bg-blue-500 hover:bg-blue-400" : "bg-emerald-500 hover:bg-emerald-400"}`}>
                      {isSavingComment ? "..." : "POST FEEDBACK"}
                    </button>
                  </div>
                </div>
              )}

              <div className="px-4 pb-4 pt-4 flex gap-2 shrink-0">
                <button onClick={() => setActiveTab("ALL")} className={`flex-1 py-1.5 rounded-sm text-[9px] font-bold uppercase tracking-widest transition-colors border ${activeTab === 'ALL' ? 'bg-zinc-800 text-white border-zinc-700' : 'text-zinc-500 hover:bg-[#0a0a0a] border-zinc-800/50 hover:border-zinc-700'}`}>All</button>
                <button onClick={() => setActiveTab("CLIENT")} className={`flex-1 py-1.5 rounded-sm text-[9px] font-bold uppercase tracking-widest transition-colors border ${activeTab === 'CLIENT' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'text-zinc-500 hover:bg-[#0a0a0a] border-zinc-800/50 hover:border-zinc-700'}`}>Client</button>
                <button onClick={() => setActiveTab("DESIGNER")} className={`flex-1 py-1.5 rounded-sm text-[9px] font-bold uppercase tracking-widest transition-colors border ${activeTab === 'DESIGNER' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' : 'text-zinc-500 hover:bg-[#0a0a0a] border-zinc-800/50 hover:border-zinc-700'}`}>Internal</button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-3 bg-[#080808]">
                {aiSummary && (
                  <div className="mb-4 bg-linear-to-br from-[#111] to-[#0a0a0a] border border-indigo-500/30 rounded-sm shadow-2xl relative overflow-hidden animate-fade-in-up">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                    <div className="p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-indigo-400 flex items-center gap-2">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          AI Synthesis
                        </span>
                        <button onClick={() => setAiSummary(null)} className="text-zinc-500 hover:text-white transition-colors text-xs">✕</button>
                      </div>
                      <div className="text-[13px] text-zinc-300 leading-relaxed space-y-2">
                        {aiSummary.split('\n').map((line, i) => {
                          if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
                            return <li key={i} className="ml-4 list-disc marker:text-indigo-500">{line.replace(/^[-*]\s*/, '')}</li>;
                          }
                          if (line.trim() === '') return <br key={i} />;
                          return <p key={i}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {isCompareMode ? (
                  <div className="text-center text-zinc-500 text-xs mt-10 font-mono tracking-wide px-4 leading-relaxed">
                    Pins are hidden while in Compare Mode.<br/><br/>Exit Compare Mode to view or leave feedback.
                  </div>
                ) : filteredComments.length === 0 ? (
                  <div className="text-center text-zinc-500 text-xs mt-10 font-mono tracking-wide">No pins match this view.</div>
                ) : (
                  filteredComments.map((comment: any, index: number) => {
                    const parsed = parseComment(comment.text);
                    const isDesignerComment = comment.authorId === project?.ownerId;
                    const pinColor = isDesignerComment ? "bg-blue-500" : "bg-emerald-500";
                    const isSpatial = comment.xPos !== 0 && comment.yPos !== 0;
                    const isActive = activePinId === comment.id;
                    const isEditing = editingCommentId === comment.id;
                    const isAuthor = currentUserId === comment.authorId;

                    return (
                      <div key={comment.id} onClick={() => !isEditing && handleCardClick(comment, parsed.timestamp)} className={`group p-4 rounded-sm border transition-all duration-300 shadow-sm cursor-pointer relative ${comment.isResolved ? "bg-[#050505] border-zinc-900 opacity-60" : isActive ? "bg-[#111] border-zinc-500 scale-[1.02] shadow-xl" : "bg-[#0a0a0a] border-zinc-800 hover:border-zinc-600"}`}>
                        
                        {isAuthor && !comment.isResolved && !isEditing && !isLocked && (
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-[#111] border border-zinc-700 rounded-sm overflow-hidden shadow-lg z-20">
                            <button onClick={(e) => { e.stopPropagation(); setEditCommentText(parsed.text); setEditingCommentId(comment.id); }} className="px-2 py-1.5 text-zinc-400 hover:text-white hover:bg-blue-500/20 transition-colors border-r border-zinc-700" title="Edit Pin">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button onClick={(e) => requestCommentDelete(comment.id, e)} className="px-2 py-1.5 text-zinc-400 hover:text-white hover:bg-red-500/20 transition-colors" title="Delete Pin">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        )}

                        <div className="flex items-start gap-3 pr-4">
                          {isSpatial ? (
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 transition-all ${comment.isResolved ? "bg-zinc-900 text-zinc-600" : `${pinColor} text-[#050505]`} ${isActive ? 'ring-2 ring-white/50' : ''}`}>{index + 1}</div>
                          ) : (
                            <div className="w-6 h-6 rounded-sm bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 shrink-0 mt-0.5">{assetType === 'audio' ? '🎵' : '📄'}</div>
                          )}
                          
                          <div className="w-full">
                            {isEditing ? (
                              <div className="flex flex-col gap-2 mt-1">
                                <textarea 
                                  className="w-full bg-[#050505] text-white border border-emerald-500/50 rounded-sm p-2 text-sm focus:border-emerald-500 focus:outline-none resize-none shadow-inner" 
                                  rows={2} autoFocus
                                  value={editCommentText} 
                                  onChange={(e) => setEditCommentText(e.target.value)} 
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex justify-end gap-3 mt-1">
                                  <button onClick={(e) => { e.stopPropagation(); setEditingCommentId(null); }} className="text-[10px] text-zinc-500 hover:text-white uppercase tracking-widest font-bold transition-colors">Cancel</button>
                                  <button onClick={(e) => { e.stopPropagation(); handleUpdateComment(comment.id, comment.text); }} className="text-[10px] bg-emerald-500 text-[#050505] px-4 py-1.5 rounded-sm uppercase tracking-widest font-bold hover:bg-emerald-400 transition-colors">Save</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                {parsed.audioUrl ? (
                                  <div className="mb-2 bg-[#111] p-3 rounded-sm border border-zinc-800/80 shadow-inner">
                                    <div className="flex items-center gap-2 mb-3">
                                      <span className={`text-[10px] uppercase font-mono tracking-widest font-bold flex items-center gap-1.5 ${isDesignerComment ? 'text-blue-500' : 'text-emerald-500'}`}>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                        Voice Note Transcript
                                      </span>
                                    </div>
                                    <audio src={parsed.audioUrl} controls className="w-full custom-audio-player h-8" onClick={(e) => e.stopPropagation()}/>
                                    {parsed.text && (
                                      <div className={`mt-3 pl-3 border-l-2 ${isDesignerComment ? 'border-blue-500/30' : 'border-emerald-500/30'}`}>
                                        <p className={`text-[12px] italic leading-relaxed text-zinc-400 ${comment.isResolved ? "line-through" : ""}`}>
                                          "{parsed.text}"
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  parsed.text && (
                                    <p className={`text-[14px] leading-relaxed wrap-break-word ${comment.isResolved ? "text-zinc-600 line-through" : "text-white font-medium"}`}>{parsed.text}</p>
                                  )
                                )}
                              </div>
                            )}
                            
                            {parsed.timestamp !== null && !isEditing && <div className="mt-2 text-[10px] font-mono text-zinc-500 bg-zinc-900 inline-block px-2 py-0.5 rounded-sm border border-zinc-800">@ {Math.floor(parsed.timestamp / 60)}:{(parsed.timestamp % 60).toFixed(1).padStart(4, '0')}</div>}
                            
                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800/50">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-30" title={comment.author?.name || comment.author?.email}>{comment.author?.name || "Guest"}</span>
                                <span className={`text-[8px] w-fit font-bold uppercase tracking-widest ${isDesignerComment ? "text-blue-500" : "text-emerald-500"}`}>{isDesignerComment ? "Designer" : "Client"}</span>
                              </div>
                              
                              {!comment.isResolved && !isEditing && !isLocked ? (
                                isOwner ? (
                                  <button onClick={(e) => handleToggleResolve(comment.id, comment.isResolved, e)} className="text-[10px] text-emerald-500 hover:bg-emerald-500 hover:text-[#050505] uppercase tracking-widest font-bold transition-all bg-emerald-500/10 px-3 py-1.5 rounded-sm border border-emerald-500/30">
                                    ✓ Resolve
                                  </button>
                                ) : (
                                  <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest bg-zinc-900 px-2 py-1 rounded-sm border border-zinc-800">Pending</span>
                                )
                              ) : comment.isResolved ? (
                                <div className="flex items-center gap-3">
                                  {isOwner && !isLocked && (
                                    <button onClick={(e) => handleToggleResolve(comment.id, comment.isResolved, e)} className="text-[9px] text-zinc-500 hover:text-white transition-colors underline uppercase tracking-widest font-bold">Re-open</button>
                                  )}
                                  <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest font-bold">✓ Resolved</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {rightSidebarTab === "ACTIVITY" && (
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 bg-[#080808]">
              {project?.activityLogs?.length === 0 ? (
                <div className="text-center text-zinc-500 text-xs mt-10 font-mono tracking-wide">No activity recorded yet.</div>
              ) : (
                <div className="space-y-0">
                  {project?.activityLogs?.map((log: any) => (
                    <div key={log.id} className="flex gap-4 items-start relative group pb-6">
                        <div className="absolute top-5 left-1.75 -bottom-1 w-px bg-zinc-800 group-last:hidden"></div>
                        
                        <div className="w-4 h-4 rounded-full bg-[#111] border border-zinc-700 flex items-center justify-center shrink-0 mt-1 z-10 shadow-lg">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            log.action === 'UPLOAD' ? 'bg-blue-500' : 
                            log.action === 'COMMENT' ? 'bg-emerald-500' : 
                            log.action === 'RESOLVE' ? 'bg-zinc-400' : 
                            log.action === 'STATUS' ? 'bg-amber-500' : 
                            'bg-purple-500'
                          }`}></div>
                        </div>
                        
                        <div className="flex flex-col gap-1">
                          <p className="text-[12px] text-zinc-300 leading-snug">{log.details}</p>
                          <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">
                            {new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Dashboard View Component (Shown when no Project ID is active)
// ----------------------------------------------------------------------------
function DashboardView() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (session?.user) {
      fetchProjects();
    }
  }, [session, status]);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${(session?.user as any).id}`);
      if (res.ok) setProjects(await res.json());
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const createProject = async () => {
    const title = prompt("Enter project name:");
    if (!title) return;
    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, ownerId: (session?.user as any).id })
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/?projectId=${data.id}`);
      }
    } catch (e) { console.error(e); }
  };

  if (isLoading || status === "loading") {
    return <div className="fixed inset-0 flex items-center justify-center bg-[#050505] text-emerald-500 font-mono text-sm tracking-widest uppercase animate-pulse">Loading FinalFrame...</div>;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12 border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">FinalFrame</h1>
            <p className="text-zinc-500 text-sm mt-1">Welcome back, {session?.user?.name || 'Designer'}</p>
          </div>
          <button onClick={createProject} className="bg-emerald-500 text-[#050505] px-6 py-2 rounded-sm font-bold text-xs uppercase tracking-widest hover:bg-emerald-400 transition-colors">
            + New Project
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <div key={p.id} onClick={() => router.push(`/?projectId=${p.id}`)} className="bg-[#0a0a0a] border border-zinc-800 rounded-sm p-6 cursor-pointer hover:border-emerald-500 transition-all group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800 group-hover:bg-emerald-500 transition-colors"></div>
              <h2 className="text-lg font-bold mb-2">{p.title}</h2>
              <div className="flex justify-between items-center mt-6">
                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">{new Date(p.updatedAt).toLocaleDateString()}</span>
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm ${p.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-400'}`}>
                  {p.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="col-span-full text-center py-20 text-zinc-500 font-mono text-sm border border-dashed border-zinc-800 rounded-sm">
              No projects found. Create your first workspace.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main Export Wrapper
// ----------------------------------------------------------------------------
// We wrap the component in Suspense to safely use useSearchParams in Next.js
function AppContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');

  if (projectId) {
    return <WorkspaceView projectId={projectId} />;
  }
  return <DashboardView />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-[#050505] text-emerald-500 font-mono text-sm tracking-widest uppercase animate-pulse">Loading App...</div>}>
      <AppContent />
    </Suspense>
  );
}