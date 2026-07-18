// web/components/workspace/CanvasArea.tsx
"use client";

import {
  useState, useRef, useMemo, useEffect, MouseEvent, WheelEvent,
} from "react";
import dynamic from "next/dynamic";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { API_URL, getAssetType, getCodeLanguage, parseComment } from "@/utils/helpers";
import { useFileUpload } from "@/hooks/useFileUpload";

const DynamicPdfEngine = dynamic(() => import("@/components/PdfEngine"), {
  ssr: false,
  loading: () => <div className="text-emerald-500 font-mono text-xs animate-pulse p-20 uppercase tracking-widest text-center w-full">Compiling Document Engine...</div>,
});

export default function CanvasArea() {
  const {
    projectId, project, isOwner, isLocked, activeAssetId, socket,
    fetchProjectDetails, currentUserId, activeAsset, assetStacks, filteredComments,
  } = useWorkspaceData();

  const {
    activeTab, activePinId, setActivePinId, isCompareMode, setIsCompareMode,
    compareBaseAssetId, setCompareBaseAssetId, compareTargetAssetId, setCompareTargetAssetId,
  } = useWorkspaceUI();

  const { uploadAsset } = useFileUpload();

  const assetType = getAssetType(activeAsset?.fileName || "");
  const isSpatialAsset = assetType === "image" || assetType === "video" || assetType === "code" || assetType === "pdf";

  const assetSignatureRef = useRef("");
  const stableFileUrlRef = useRef("");

  const currentSignature = `${activeAsset?.id}-${activeAsset?.version}`;
  if (activeAsset?.fileUrl && assetSignatureRef.current !== currentSignature) {
    stableFileUrlRef.current = activeAsset.fileUrl;
    assetSignatureRef.current = currentSignature;
  }
  const stableFileUrl = stableFileUrlRef.current;

  const activeAssetStack = activeAsset?.fileName ? assetStacks[activeAsset.fileName] : null;

  const baseCompareAsset = useMemo(() => {
    if (!activeAssetStack) return null;
    if (compareBaseAssetId) return activeAssetStack.find((a) => a.id === compareBaseAssetId) || activeAsset;
    return activeAsset;
  }, [activeAssetStack, compareBaseAssetId, activeAsset]);

  const targetCompareAsset = useMemo(() => {
    if (!activeAssetStack) return null;
    if (compareTargetAssetId) return activeAssetStack.find((a) => a.id === compareTargetAssetId) || null;
    const baseVersion = baseCompareAsset?.version || 0;
    return activeAssetStack.find((a) => a.version < baseVersion) || activeAssetStack[activeAssetStack.length - 1];
  }, [activeAssetStack, compareTargetAssetId, baseCompareAsset]);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMediaLoading, setIsMediaLoading] = useState(true);

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const rafRef = useRef<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);

  const [compareSliderPos, setCompareSliderPos] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  const [codeContent, setCodeContent] = useState<string | null>(null);

  const emptyStateFileInputRef = useRef<HTMLInputElement>(null);
  const assetRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const compareContainerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const isMoved = useRef(false);
  const lastEmit = useRef<number>(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<any>(null);

  // PHASE 4: Hard cleanup of Media Devices and URLs on Unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (mediaRecorderRef.current?.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    };
  }, [audioBlobUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      if (e.key === "Escape") {
        setIsDragging(false);
        if (pendingPin) clearPendingPin();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setIsSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [pendingPin]);

  useEffect(() => {
    setIsMediaLoading(true);
    setCodeContent(null);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [activeAssetId]);

  useEffect(() => {
    if (assetType === "unknown") setIsMediaLoading(false);
  }, [assetType]);

  useEffect(() => {
    if (activeAsset && assetType === "code" && stableFileUrl) {
      fetch(stableFileUrl)
        .then((res) => res.text())
        .then((text) => {
          setCodeContent(text);
          setIsMediaLoading(false);
        })
        .catch(() => {
          setCodeContent("// Error: Could not load code file.");
          setIsMediaLoading(false);
        });
    }
  }, [stableFileUrl, assetType, activeAsset]);

  useEffect(() => {
    if (activePinId && activeAsset && assetRef.current) {
      const comment = activeAsset.comments.find((c: any) => c.id === activePinId);
      if (comment && comment.xPos !== 0 && comment.yPos !== 0) {
        const w = assetRef.current.clientWidth;
        const h = assetRef.current.clientHeight;
        let panX = ((50 - comment.xPos) / 100) * w * scale;
        let panY = 0;

        if (assetType === "pdf" || assetType === "code") {
          const viewportHalfHeight = typeof window !== "undefined" ? window.innerHeight / 2 : 500;
          panY = -((comment.yPos / 100) * h * scale) + viewportHalfHeight;
        } else {
          panY = ((50 - comment.yPos) / 100) * h * scale;
        }
        setPosition({ x: panX, y: panY });

        const parsed = parseComment(comment.text);
        if (assetType === "video" && videoRef.current && parsed.timestamp !== null) {
          videoRef.current.currentTime = parsed.timestamp;
        }
      }
    }
  }, [activePinId, activeAsset, assetType, scale]);

  const MemoizedPdfRenderer = useMemo(() => {
    if (assetType !== "pdf" || !stableFileUrl) return null;
    return (
      <div className="border border-zinc-800 shadow-2xl relative pointer-events-none bg-[#050505]">
        <DynamicPdfEngine fileUrl={stableFileUrl} onLoad={() => setIsMediaLoading(false)} />
      </div>
    );
  }, [stableFileUrl, assetType]);

  const MemoizedCodeViewer = useMemo(() => {
    if (assetType !== "code" || !stableFileUrl) return null;
    return (
      <div className="relative w-full max-w-[90vw] h-auto bg-[#050505] border border-zinc-800 text-left shadow-2xl overflow-hidden rounded-sm pointer-events-none text-[13px]">
        <SyntaxHighlighter language={getCodeLanguage(activeAsset?.fileName || "")} style={vscDarkPlus} customStyle={{ background: "transparent", margin: 0, padding: "24px", overflowX: "hidden" }} wrapLongLines={true}>
          {codeContent || "// Downloading Source Code..."}
        </SyntaxHighlighter>
      </div>
    );
  }, [stableFileUrl, assetType, codeContent, activeAsset?.fileName]);

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (isCompareMode) return;
    e.preventDefault();
    if (!project?.assets?.length) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const zoomAmount = -e.deltaY * 0.002;
      setScale(Math.min(Math.max(0.2, scale + zoomAmount), 5));
    } else {
      setPosition((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCompareMode || e.button !== 0 || pendingPin) return;
    if (isSpacePressed) {
      setIsDragging(true);
      isMoved.current = false;
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isSpacePressed && isDragging) {
      isMoved.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
      });
    }

    if (isDraggingSlider && compareContainerRef.current) {
      const rect = compareContainerRef.current.getBoundingClientRect();
      let pos = ((e.clientX - rect.left) / rect.width) * 100;
      setCompareSliderPos(Math.max(0, Math.min(100, pos)));
    }

    if (!socket || !project?.ownerId) return;
    const now = Date.now();
    if (now - lastEmit.current > 50) {
      socket.emit("cursor-move", { projectId, x: e.clientX, y: e.clientY, name: isOwner ? "Designer" : "Client", color: "#10b981" });
      lastEmit.current = now;
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    setIsDraggingSlider(false);
  };

  const handleImageClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isLocked || isCompareMode) return;
    if (isMoved.current || !isSpatialAsset) {
      isMoved.current = false;
      return;
    }

    if (activePinId) {
      setActivePinId(null);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      return;
    }
    if (pendingPin) {
      clearPendingPin();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;
    if (assetType === "video" && clickY > 88) return;
    if (assetType === "video" && videoRef.current) setTimeout(() => videoRef.current?.pause(), 10);

    setPendingPin({ x: ((e.clientX - rect.left) / rect.width) * 100, y: clickY });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioBlobUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } catch (error) {
      toast.error("Microphone access denied. Please check your browser permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // PHASE 4: Memory Leak Fix - Revoke Blob URL when discarding voice note
  const discardAudio = () => {
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    setAudioBlob(null);
    setRecordingTime(0);
    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const clearPendingPin = () => {
    discardAudio(); 
    setPendingPin(null);
    setCommentText("");
    setActivePinId(null);
    if (assetType === "video" && videoRef.current) setTimeout(() => videoRef.current?.play().catch(() => {}), 10);
  };

  const handleSaveComment = async (e?: any) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    
    let finalAudioBlob = audioBlob;

    if (isRecording && mediaRecorderRef.current) {
      setIsSavingComment(true);
      finalAudioBlob = await new Promise<Blob>((resolve) => {
        mediaRecorderRef.current!.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current!.mimeType || "audio/webm" });
          setAudioBlob(blob);
          const url = URL.createObjectURL(blob);
          setAudioBlobUrl(url);
          resolve(blob);
        };
        mediaRecorderRef.current!.stop();
        setIsRecording(false);
        clearInterval(timerRef.current);
      });
    }

    if ((!commentText.trim() && !finalAudioBlob) || !activeAsset || !currentUserId) {
      setIsSavingComment(false);
      return;
    }
    
    setIsSavingComment(true);
    let uploadedAudioUrl = null;

    if (finalAudioBlob) {
      try {
        // PHASE 4: Update Audio Upload to use POST & FormData matching backend constraints
        const presignRes = await fetch(`${API_URL}/api/upload-audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include" 
        });
        
        if (presignRes.ok) {
          const { url, fields, fileUrl } = await presignRes.json();
          
          const formData = new FormData();
          Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
          formData.append("file", finalAudioBlob);

          const r2UploadRes = await fetch(url, { method: "POST", body: formData });
          if (r2UploadRes.ok) {
            uploadedAudioUrl = fileUrl;
          } else {
            throw new Error("Failed to upload audio bytes to R2.");
          }
        }
      } catch (err) {
        toast.error("Failed to upload voice note. Saving text only.");
      }
    }

    let finalCommentText = commentText;
    if ((assetType === "video" && videoRef.current) || uploadedAudioUrl) {
      const payload: any = { t: commentText };
      if (assetType === "video" && videoRef.current) payload.ts = videoRef.current.currentTime;
      if (uploadedAudioUrl) payload.audioUrl = uploadedAudioUrl;
      finalCommentText = JSON.stringify(payload);
    }

    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/assets/${activeAsset.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: finalCommentText,
          xPos: pendingPin?.x || 0,
          yPos: pendingPin?.y || 0,
          authorId: currentUserId,
          projectId,
        }),
      });
      
      if (res.ok) {
        clearPendingPin();
        fetchProjectDetails(true);
        toast.success("Feedback pinned successfully");
      } else toast.error("Failed to save pin");
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsSavingComment(false);
    }
  };

  const processFileUpload = async (file: File) => {
    if (!file) return;
    try {
      await uploadAsset(projectId, file);
      await fetchProjectDetails(true);
    } catch (error) {
      // Handled by hook
    } finally {
      if (emptyStateFileInputRef.current) emptyStateFileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); if (isOwner && !isLocked) setIsDraggingFile(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (!isOwner || isLocked) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFileUpload(file);
  };

  if (!activeAsset) {
    return (
      <div className="flex-1 min-w-0 flex bg-[#0a0a0a] relative overflow-hidden touch-none items-center justify-center" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <AnimatePresence>
          {isDraggingFile && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-emerald-500/10 backdrop-blur-sm border-4 border-emerald-500/50 border-dashed m-4 rounded-xl flex items-center justify-center">
              <div className="flex flex-col items-center justify-center p-12 bg-[#050505]/90 rounded-md shadow-2xl border border-emerald-500/30">
                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full mb-6 flex items-center justify-center animate-bounce">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight mb-2">Drop to Upload</h3>
                <p className="text-zinc-400 text-sm font-medium">Release your mouse to add this file to the workspace.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <input type="file" accept="image/*,video/*,application/pdf,text/plain,.js,.ts,.tsx,.json,.css,.html,.py,.md" className="hidden" ref={emptyStateFileInputRef} onChange={(e) => { if (e.target.files?.[0]) processFileUpload(e.target.files[0]); }} />
        {isOwner ? (
          <div onClick={() => emptyStateFileInputRef.current?.click()} className="flex flex-col items-center justify-center p-12 text-zinc-500 font-mono tracking-widest text-sm group border border-transparent rounded-sm transition-all duration-300 cursor-pointer hover:bg-[#111] hover:border-zinc-800">
            <div className="w-20 h-20 border-2 border-dashed border-zinc-700 group-hover:border-emerald-500 group-hover:text-emerald-500 rounded-full mb-6 flex items-center justify-center transition-colors shadow-inner">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
            </div>
            <div className="text-zinc-400 mb-2 uppercase group-hover:text-white transition-colors font-bold tracking-widest">Workspace Empty</div>
            <div className="text-xs text-zinc-500 mt-2 font-sans font-medium uppercase tracking-widest">Click or drag a file here to initialize</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-500 font-mono tracking-widest text-sm">
            <svg className="w-12 h-12 text-zinc-800 mb-6 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            <span className="uppercase tracking-widest text-xs font-bold">Waiting for Designer...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex bg-[#0a0a0a] relative overflow-hidden touch-none outline-none" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => { if (activePinId) { setActivePinId(null); setScale(1); setPosition({ x: 0, y: 0 }); } if (pendingPin) clearPendingPin(); }} onWheel={isSpatialAsset && !isCompareMode ? handleWheel : undefined} onPointerDown={isSpatialAsset && !isCompareMode ? handlePointerDown : undefined} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-100 bg-emerald-500/10 backdrop-blur-sm border-4 border-emerald-500/50 border-dashed m-4 rounded-xl flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center justify-center p-12 bg-[#050505]/90 rounded-md shadow-2xl border border-emerald-500/30">
              <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full mb-6 flex items-center justify-center animate-bounce">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight mb-2">Drop to Upload New Version</h3>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCompareMode && assetType === "image" && activeAssetStack && baseCompareAsset && targetCompareAsset && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[100] bg-[#0a0a0a]/95 backdrop-blur-md border border-zinc-800 rounded-sm shadow-2xl flex items-center p-1.5 gap-3 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-2">
                <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Comparing</span>
                <select value={baseCompareAsset.id} onChange={(e) => setCompareBaseAssetId(e.target.value)} className="bg-[#111] border border-zinc-700 text-white text-xs font-bold px-2 py-1 rounded-sm outline-none cursor-pointer hover:border-emerald-500 transition-colors focus:ring-1 focus:ring-emerald-500">
                  {activeAssetStack.map((a) => (
                    <option key={a.id} value={a.id}>Version {a.version} {a.id === activeAssetStack[0].id ? "(Latest)" : ""}</option>
                  ))}
                </select>
                <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 mx-1">vs</span>
                <select value={targetCompareAsset.id} onChange={(e) => setCompareTargetAssetId(e.target.value)} className="bg-[#111] border border-zinc-700 text-white text-xs font-bold px-2 py-1 rounded-sm outline-none cursor-pointer hover:border-emerald-500 transition-colors focus:ring-1 focus:ring-emerald-500">
                  {activeAssetStack.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.id === baseCompareAsset.id}>Version {a.version}</option>
                  ))}
                </select>
              </div>
              <div className="w-px h-6 bg-zinc-800"></div>
              <button onClick={() => setIsCompareMode(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-[#050505] rounded-sm text-[10px] font-bold uppercase tracking-widest transition-colors border border-rose-500/20 hover:border-rose-500">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                Exit
              </button>
            </motion.div>
          )}
      </AnimatePresence>

      {isSpatialAsset && scale !== 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-6 right-6 z-40 bg-[#050505]/90 backdrop-blur-md border border-zinc-800 rounded-sm shadow-2xl flex items-center gap-2 p-1.5">
          <span className="text-xs font-mono text-zinc-400 font-bold px-3 tracking-widest">{Math.round(scale * 100)}%</span>
          <div className="w-px h-4 bg-zinc-800"></div>
          <button onClick={(e) => { e.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }); }} className="px-3 py-1.5 text-xs uppercase tracking-widest font-bold text-zinc-300 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-sm transition-colors">Reset View</button>
        </motion.div>
      )}

      {isCompareMode && assetType === "image" && targetCompareAsset && baseCompareAsset ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 relative select-none">
          <div ref={compareContainerRef} className="relative shadow-2xl border border-zinc-800 bg-[#050505] flex justify-center overflow-hidden">
            <img src={baseCompareAsset.fileUrl} className="block max-w-[90vw] max-h-[85vh] object-contain pointer-events-none" style={{ clipPath: `polygon(0 0, ${compareSliderPos}% 0, ${compareSliderPos}% 100%, 0 100%)` }} />
            <img src={targetCompareAsset.fileUrl} className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none" />
            <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 cursor-ew-resize flex items-center justify-center hover:bg-emerald-400 transition-colors z-[100] shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ left: `${compareSliderPos}%` }} onPointerDown={(e) => { e.stopPropagation(); setIsDraggingSlider(true); }}>
              <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg text-[#050505] text-xs font-bold ring-4 ring-[#050505]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3" /></svg>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`w-full h-full flex justify-center ${assetType === "pdf" || assetType === "code" ? "items-start pt-12" : "items-center"} ${isSpacePressed ? (isDragging ? "cursor-grabbing" : "cursor-grab") : isSpatialAsset && !isLocked ? "cursor-crosshair" : "cursor-default"}`} style={{ transform: isSpatialAsset ? `translate(${position.x}px, ${position.y}px) scale(${scale})` : "none", transformOrigin: assetType === "pdf" || assetType === "code" ? "top center" : "center center", transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)", willChange: "transform" }}>
          <div ref={assetRef} className={`relative inline-block shadow-2xl cursor-inherit w-full ${assetType === "pdf" || assetType === "code" ? "h-auto" : "h-full"}`} onClick={handleImageClick}>
            {isMediaLoading && (assetType === "image" || assetType === "video" || assetType === "pdf") && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none bg-[#050505]/50 backdrop-blur-sm">
                  <div className="w-12 h-12 border-4 border-zinc-800 border-t-emerald-500 rounded-full animate-spin shadow-lg"></div>
                </div>
              )}

            {assetType === "image" && stableFileUrl && <img key={stableFileUrl} src={stableFileUrl} alt="Asset" fetchPriority="high" onLoad={() => setIsMediaLoading(false)} onError={() => { setIsMediaLoading(false); toast.error("Failed to display image from storage."); }} className={`block object-contain pointer-events-none border border-zinc-800 bg-[#050505] transition-opacity duration-300 ${isMediaLoading ? "opacity-0" : "opacity-100"}`} style={{ maxHeight: "85vh", maxWidth: "90vw" }} />}
            {assetType === "video" && stableFileUrl && <video key={stableFileUrl} ref={videoRef} src={stableFileUrl} controls onLoadedData={() => setIsMediaLoading(false)} onError={() => { setIsMediaLoading(false); toast.error("Failed to load video stream."); }} className={`block border border-zinc-800 bg-[#050505] transition-opacity duration-300 ${isMediaLoading ? "opacity-0" : "opacity-100"}`} style={{ maxHeight: "85vh", maxWidth: "90vw" }} onTimeUpdate={() => setCurrentVideoTime(videoRef.current?.currentTime || 0)} />}
            {assetType === "pdf" && MemoizedPdfRenderer}
            {assetType === "code" && MemoizedCodeViewer}

            {assetType === "unknown" && (
              <div className="flex flex-col items-center justify-center bg-[#050505] border border-zinc-800 p-16 rounded-sm mx-auto mt-32 max-w-lg">
                <svg className="w-16 h-16 text-zinc-700 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <p className="text-zinc-400 font-mono text-xs mb-6 tracking-widest uppercase font-bold">Preview Unavailable</p>
                <a href={stableFileUrl} download target="_blank" className="bg-emerald-500 text-[#050505] font-bold px-6 py-2 rounded-sm text-xs tracking-widest uppercase hover:bg-emerald-400 transition-colors shadow-lg">Download File</a>
              </div>
            )}

            {isSpatialAsset && filteredComments.map((comment: any, index: number) => {
                const parsed = parseComment(comment.text);
                const isDesignerComment = comment.authorId === project?.ownerId;
                const pinBg = isDesignerComment ? "bg-blue-600 text-white border-white/80" : "bg-emerald-500 text-[#050505] border-[#050505]/50";
                const isActive = activePinId === comment.id;

                if (assetType === "video" && parsed.timestamp !== null) {
                  if (Math.abs(currentVideoTime - parsed.timestamp) > 1.5 && !isActive) return null;
                }

                return (
                  <div key={comment.id} onClick={(e) => { e.stopPropagation(); setActivePinId(comment.id); }} className={`absolute ${isActive ? "z-50" : "z-10"}`} style={{ left: `${comment.xPos}%`, top: `${comment.yPos}%`, width: "28px", height: "28px", transform: `translate(-50%, -50%) scale(${1 / scale})` }}>
                    <div className={`w-full h-full ${pinBg} rounded-full border-2 cursor-pointer group flex items-center justify-center transition-all duration-300 ease-out shadow-[0_4px_15px_rgba(0,0,0,0.6)] ${isActive ? "scale-[1.8] ring-4 ring-white/30" : "hover:scale-110 hover:ring-2 hover:ring-white/30"}`}>
                      <span className={`font-bold pointer-events-none transition-all ${isActive ? "text-[8px]" : "text-xs"}`}>{index + 1}</span>
                      <div className={`absolute transition-all bottom-full left-1/2 transform -translate-x-1/2 mb-3 bg-[#111] border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 rounded-sm whitespace-nowrap z-20 pointer-events-none shadow-2xl ${isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"}`}>
                        {parsed.audioUrl ? (
                          <div className="flex flex-col gap-1.5">
                            <span className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${isDesignerComment ? "text-blue-400" : "text-emerald-500"}`}>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                              Voice Note
                            </span>
                            {parsed.text && <span className="italic text-[11px] truncate max-w-50 text-white">"{parsed.text}"</span>}
                          </div>
                        ) : (
                          <span className="text-white text-xs">{parsed.text}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            {pendingPin && isSpatialAsset && !isLocked && (
              <div className="absolute z-30" style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%`, width: "28px", height: "28px", transform: `translate(-50%, -50%) scale(${1 / scale})` }}>
                <div className={`w-full h-full rounded-full border-2 shadow-2xl animate-bounce ${isOwner ? "bg-blue-600 border-white/80" : "bg-emerald-500 border-[#050505]/50"}`} />
                <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-[#050505] border border-zinc-700 p-4 rounded-sm shadow-2xl w-80 cursor-default" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                  {isRecording ? (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-sm p-2.5 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-xs text-emerald-500 font-mono font-bold tracking-widest">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}</span>
                      </div>
                      <button onClick={stopRecording} className="w-6 h-6 flex items-center justify-center bg-emerald-500 text-[#050505] rounded-sm hover:bg-emerald-400 transition-colors">■</button>
                    </div>
                  ) : audioBlobUrl ? (
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-sm p-2 mb-3">
                      <audio src={audioBlobUrl} controls className="w-full h-8 custom-audio-player opacity-80" />
                      <button onClick={discardAudio} className="w-6 h-6 shrink-0 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-sm transition-colors">✕</button>
                    </div>
                  ) : null}
                  <textarea className="w-full bg-[#111] text-white border border-zinc-800 rounded-sm p-3 text-sm focus:border-emerald-500 focus:outline-none resize-none shadow-inner leading-relaxed transition-colors" rows={3} autoFocus placeholder={isOwner ? "Drop a designer note..." : "Leave your feedback..."} value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (commentText.trim() || audioBlob || isRecording) handleSaveComment(e); } }} />
                  <div className="flex justify-between items-center mt-3">
                    <div className="flex items-center gap-3">
                      <button onClick={startRecording} disabled={isRecording || audioBlob !== null} className={`text-zinc-500 transition-colors ${isRecording || audioBlob ? "opacity-50 cursor-not-allowed" : "hover:text-emerald-500"}`} title="Record Voice Note">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                      </button>
                      <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest hidden md:block">↵ To Save</span>
                    </div>
                    <div className="flex justify-end gap-2.5">
                      <button onClick={(e) => { e.stopPropagation(); clearPendingPin(); }} className="px-4 py-1.5 text-xs text-zinc-400 hover:text-white font-bold tracking-widest transition-colors uppercase rounded-sm hover:bg-zinc-900">Cancel</button>
                      <button onClick={handleSaveComment} disabled={isSavingComment || (!commentText.trim() && !audioBlob && !isRecording)} className="text-xs text-[#050505] px-5 py-1.5 font-bold uppercase tracking-widest rounded-sm disabled:opacity-50 transition-colors shadow-sm bg-emerald-500 hover:bg-emerald-400">{isSavingComment ? "..." : "Save"}</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}