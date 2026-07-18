// web/components/workspace/WorkspaceHeader.tsx
"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { API_URL, getAssetType, escapeHTML } from "@/utils/helpers";
import { useFileUpload } from "@/hooks/useFileUpload";

export default function WorkspaceHeader() {
  const { 
    projectId, project, isOwner, isLocked, activeAssetId, setActiveAssetId, 
    activeUsers, fetchProjectDetails, assetStacks, activeAsset 
  } = useWorkspaceData();

  const { 
    isAssetSidebarOpen, setIsAssetSidebarOpen, isCompareMode, setIsCompareMode 
  } = useWorkspaceUI();

  const { uploadAsset } = useFileUpload();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false); 
  
  const [uploadingToFileName, setUploadingToFileName] = useState<string | null>(null);
  const versionFileInputRef = useRef<HTMLInputElement>(null);
  const [errorToast, setErrorToast] = useState("");

  const activeAssetStack = activeAsset ? assetStacks[activeAsset.fileName] : null;
  const canDownload = isOwner || project?.isDownloadUnlocked;

  const handleRenameProject = async () => {
    if (!editTitleText.trim() || editTitleText === project?.title) { setIsEditingTitle(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: editTitleText }),
      });
      if (res.ok) { await fetchProjectDetails(true); setIsEditingTitle(false); } 
      else { setErrorToast("Failed to rename project."); setTimeout(() => setErrorToast(""), 4000); }
    } catch (error) { console.error(error); }
  };

  // PHASE 4: Fixed Approval Flow UX
  const handleUpdateStatus = async (newStatus: string) => {
    const tid = toast.loading("Updating status...");
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Status update failed");
      await fetchProjectDetails(true);
      toast.success(newStatus === 'APPROVED' ? "Project Approved!" : "Changes Requested!", { id: tid });
    } catch (error) {
      toast.error("Failed to update status", { id: tid });
    }
  };

  const handleToggleDownloadUnlock = async (isUnlocked: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isDownloadUnlocked: isUnlocked }),
      });
      if (res.ok) fetchProjectDetails(true);
      else { setErrorToast("Failed to update download permissions."); setTimeout(() => setErrorToast(""), 4000); }
    } catch (error) { console.error(error); }
  };

  const handleDownloadFinalAsset = async () => {
    if (!activeAsset?.fileUrl) return;
    setIsDownloading(true);
    try {
      const response = await fetch(activeAsset.fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); 
      a.style.display = 'none'; a.href = url; a.download = activeAsset.fileName || 'final-asset';
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (error) { 
      setErrorToast("Failed to download asset."); setTimeout(() => setErrorToast(""), 4000); 
    } finally { setIsDownloading(false); }
  };

  const handleGenerateAuditLog = () => {
    if (!project) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setErrorToast("Allow popups to generate the report."); setTimeout(() => setErrorToast(""), 4000); return; }

    const totalComments = project.assets.reduce((acc: number, a: any) => acc + (a.comments?.length || 0), 0);
    const resolvedComments = project.assets.reduce((acc: number, a: any) => acc + (a.comments?.filter((c: any) => c.isResolved)?.length || 0), 0);

    const safeTitle = escapeHTML(project.title);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Audit Log - ${safeTitle}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; }
          .header { border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
          h1 { margin: 0 0 10px 0; font-size: 28px; letter-spacing: -0.5px; }
          .meta { color: #666; font-size: 14px; margin-bottom: 5px; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
          .badge.approved { background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
          .section { margin-bottom: 30px; }
          h2 { font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }
          .comment { background: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; border-radius: 6px; margin-bottom: 10px; break-inside: avoid; }
          .comment-meta { font-size: 12px; color: #666; margin-bottom: 8px; font-weight: bold; }
          .resolved { color: #10b981; font-weight: bold; border: 1px solid #10b981; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;}
          .timestamp { float: right; font-weight: normal; color: #999; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${safeTitle} - Official Audit Log</h1>
          <div class="meta"><strong>Project ID:</strong> ${project.id}</div>
          <div class="meta"><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
          <div class="meta" style="margin-top: 15px;">
            <span class="badge ${project.status === 'APPROVED' ? 'approved' : ''}">${project.status.replace('_', ' ')}</span>
          </div>
        </div>

        <div class="section">
          <h2>Executive Summary</h2>
          <p>This document serves as the official proof of work and feedback history for <strong>${safeTitle}</strong>.</p>
          <ul>
            <li><strong>Total File Versions Uploaded:</strong> ${project.assets.length}</li>
            <li><strong>Total Feedback Pins:</strong> ${totalComments}</li>
            <li><strong>Resolved Pins:</strong> ${resolvedComments}</li>
          </ul>
        </div>

        <div class="section">
          <h2>Detailed Feedback History</h2>
          ${project.assets.map((asset: any) => `
            <h3 style="margin-top: 25px; font-size: 16px;">${escapeHTML(asset.fileName)} (v${asset.version})</h3>
            ${asset.comments?.length === 0 ? '<p style="color:#666; font-style:italic;">No feedback recorded for this version.</p>' : ''}
            ${asset.comments?.map((comment: any) => {
              let text = comment.text;
              let hasAudio = false;
              if (text.startsWith('{')) {
                try {
                  const parsed = JSON.parse(text);
                  text = escapeHTML(parsed.t || "(Audio Note Only)");
                  if (parsed.audioUrl) hasAudio = true;
                } catch(e) {}
              } else {
                text = escapeHTML(text);
              }
              return `
                <div class="comment">
                  <div class="comment-meta">
                    ${escapeHTML(comment.author?.name || 'User')}
                    ${comment.isResolved ? '<span class="resolved">✓ Resolved</span>' : ''}
                    ${hasAudio ? '🎤 <em>Contains Audio</em>' : ''}
                    <span class="timestamp">${new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  <div>${text}</div>
                </div>
              `;
            }).join('')}
          `).join('')}
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const handleSendInvite = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsGeneratingLink(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/invite`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail, origin: window.location.origin })
      });
      if (res.ok) {
        const data = await res.json();
        if (!inviteEmail) {
           await navigator.clipboard.writeText(`${window.location.origin}/invite/${data.inviteToken}`);
           setCopySuccess(true); setTimeout(() => setCopySuccess(false), 3000);
        } else {
           setCopySuccess(true); setTimeout(() => { setCopySuccess(false); setIsInviteModalOpen(false); setInviteEmail(""); }, 2000);
        }
      }
    } catch (error) { console.error(error); } finally { setIsGeneratingLink(false); }
  };

  // PHASE 4: Replaced heavy manual upload logic with hook
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const data = await uploadAsset(projectId, file, uploadingToFileName || file.name);
      await fetchProjectDetails(true);
      setActiveAssetId(data.id); 
      setIsCompareMode(false); 
    } catch (error: any) { 
      // Errors handled internally by hook toasts
    } finally { 
      setUploadingToFileName(null);
      if (versionFileInputRef.current) versionFileInputRef.current.value = ""; 
    }
  };

  if (!project) return null;

  return (
    <>
      {errorToast && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-100 bg-red-500 border border-red-400 text-white px-6 py-2 rounded-sm text-xs font-bold tracking-widest shadow-2xl animate-fade-in-down">{errorToast}</div>}

      {isVersionMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setIsVersionMenuOpen(false)}></div>}

      {isInviteModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-sm shadow-2xl max-w-sm w-full animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white font-bold text-lg tracking-tight">Invite Client</h3>
              <button onClick={() => setIsInviteModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Client Email</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="client@company.com" className="w-full bg-[#111] border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none transition-colors shadow-inner" />
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <button type="submit" disabled={isGeneratingLink || !inviteEmail} className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-[#050505] font-bold text-xs rounded-sm tracking-widest uppercase transition-colors disabled:opacity-50 shadow-sm">
                  {isGeneratingLink ? "Sending..." : copySuccess && inviteEmail ? "Sent!" : "Send Email Invite"}
                </button>
                <div className="relative flex items-center py-2">
                  <div className="grow border-t border-zinc-800"></div>
                  <span className="shrink-0 mx-4 text-zinc-500 text-xs uppercase font-bold tracking-widest">OR</span>
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

      <input type="file" accept="image/*,video/*,application/pdf,text/plain,.js,.ts,.tsx,.json,.css,.html,.py,.md" className="hidden" ref={versionFileInputRef} onChange={handleFileUpload} />

      <header className="h-16 flex-none flex justify-between items-center px-4 md:px-6 border-b border-zinc-800 bg-[#050505] z-40 w-full relative">
        
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <Link href="/" className="text-zinc-500 hover:text-white transition-colors flex items-center justify-center w-8 h-8 rounded-sm hover:bg-zinc-900" title="Back to Dashboard">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          
          <div className="w-px h-6 bg-zinc-800 shrink-0 hidden md:block"></div>
          
          <button onClick={() => setIsAssetSidebarOpen(!isAssetSidebarOpen)} className={`p-2 rounded-sm transition-colors hidden md:block ${isAssetSidebarOpen ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`} aria-label="Toggle File Manager">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
          
          <div className="flex items-center gap-3 min-w-0 ml-1">
            {isEditingTitle && isOwner ? (
              <input autoFocus value={editTitleText} onChange={(e) => setEditTitleText(e.target.value)} onBlur={handleRenameProject} onKeyDown={(e) => e.key === 'Enter' && handleRenameProject()} className="bg-[#111] text-lg font-bold text-white tracking-tight border border-emerald-500 rounded-sm px-2 py-0.5 outline-none w-full max-w-62.5"/>
            ) : (
              <h1 onClick={() => { if(isOwner) { setEditTitleText(project?.title); setIsEditingTitle(true); } }} className={`text-lg font-bold text-white tracking-tight truncate ${isOwner ? 'cursor-text hover:text-zinc-300 transition-colors' : ''}`} title={isOwner ? "Click to rename project" : project?.title}>{project?.title}</h1>
            )}
            <span className={`hidden md:inline-block text-xs px-2 py-0.5 font-mono uppercase tracking-wider rounded-sm font-bold shrink-0 ${isOwner ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"}`}>{isOwner ? "Designer" : "Client"}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          
          {activeUsers.length > 0 && (
            <div className="hidden md:flex items-center -space-x-2 mr-1 border-r border-zinc-800 pr-4">
              {activeUsers.map((user, i) => {
                const isDesigner = user.email === project?.owner?.email || user.name === 'Designer';
                return (
                  <div key={i} className="relative group cursor-pointer">
                    <div className={`w-8 h-8 rounded-full border-2 border-[#050505] flex items-center justify-center text-xs font-bold shadow-lg z-10 transition-transform duration-200 hover:scale-110 hover:z-20 ${isDesigner ? 'bg-blue-600 text-white' : 'bg-emerald-500 text-[#050505]'}`}>
                      {(user.name || 'G').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="absolute top-full mt-3 left-1/2 transform -translate-x-1/2 bg-[#050505]/95 backdrop-blur-md border border-zinc-800/80 px-4 py-3 rounded-md shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] z-100 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none w-max min-w-35 flex flex-col items-center translate-y-2 group-hover:translate-y-0">
                      <p className="text-white text-xs font-bold truncate mb-0.5">{user.name || "Guest"}</p>
                      <p className="text-zinc-400 text-xs truncate mb-2">{user.email || "No email"}</p>
                      <span className={`inline-flex items-center justify-center text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-sm w-full text-center ${isDesigner ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                        {isDesigner ? 'Designer' : 'Client'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 border-r border-zinc-800 pr-4 mr-1">
            <button onClick={handleGenerateAuditLog} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm font-bold text-xs tracking-widest uppercase transition-all shrink-0" title="Export Proof of Work">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export Log
            </button>

            {canDownload && activeAsset && project?.status === 'APPROVED' && (
              <button onClick={handleDownloadFinalAsset} disabled={isDownloading} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-[#050505] rounded-sm font-bold text-xs tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0 disabled:opacity-50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4-4m4 4V4" /></svg>
                {isDownloading ? "..." : "Download"}
              </button>
            )}
          </div>

          {!isOwner && !isLocked && (
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-4 mr-1">
              <button onClick={() => handleUpdateStatus('CHANGES_REQUESTED')} className="px-3 py-1.5 text-xs font-bold tracking-widest uppercase bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-sm hover:bg-rose-500 hover:text-[#050505] transition-colors">Request Changes</button>
              <button onClick={() => handleUpdateStatus('APPROVED')} className="px-3 py-1.5 text-xs font-bold tracking-widest uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 rounded-sm hover:bg-emerald-500 hover:text-[#050505] transition-colors shadow-[0_0_10px_rgba(16,185,129,0.3)]">Approve</button>
            </div>
          )}

          {isOwner && isLocked && (
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-4 mr-1">
              <button onClick={() => handleToggleDownloadUnlock(!project?.isDownloadUnlocked)} className={`px-3 py-1.5 text-xs font-bold tracking-widest uppercase rounded-sm transition-colors ${project?.isDownloadUnlocked ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500 hover:text-[#050505]' : 'bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500 hover:text-[#050505]'}`}>
                {project?.isDownloadUnlocked ? '🔒 Revoke' : '🔓 Unlock'}
              </button>
              <button onClick={() => handleUpdateStatus('IN_REVIEW')} className="px-3 py-1.5 text-xs font-bold tracking-widest uppercase bg-zinc-800 text-white rounded-sm hover:bg-zinc-700 transition-colors">Re-Open</button>
            </div>
          )}

          {activeAssetStack && activeAssetStack.length > 0 && (
            <div className="relative z-40 hidden md:block">
              <button onClick={() => setIsVersionMenuOpen(!isVersionMenuOpen)} className="relative z-40 flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors">
                <span className="text-xs text-emerald-500 font-bold uppercase tracking-widest">v{activeAsset?.version}</span>
                <span className="text-xs text-zinc-500">▾</span>
              </button>

              {isVersionMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsVersionMenuOpen(false); }}></div>
                  <div className="absolute top-full right-0 mt-2 w-56 bg-[#050505] border border-zinc-800 rounded-sm shadow-2xl overflow-hidden z-50 flex flex-col">
                    <div className="p-2 border-b border-zinc-800 bg-[#0a0a0a]">
                      <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Version History</span>
                    </div>
                    <div className="max-h-50 overflow-y-auto no-scrollbar">
                      {activeAssetStack.map((asset: any, index: number) => {
                        const isLatest = index === 0;
                        const isCurrentlyViewing = activeAssetId === asset.id;
                        return (
                          <button key={asset.id} onClick={() => { setActiveAssetId(asset.id); setIsVersionMenuOpen(false); setIsCompareMode(false); }} className={`w-full text-left p-3 text-xs flex justify-between items-center transition-colors ${isCurrentlyViewing ? 'bg-zinc-900 text-white border-l-2 border-emerald-500' : 'text-zinc-400 hover:bg-[#0a0a0a] border-l-2 border-transparent'}`}>
                            <span className="font-mono font-bold">Version {asset.version}</span>
                            {isLatest && <span className="text-xs text-emerald-500 uppercase tracking-widest">Latest</span>}
                          </button>
                        );
                      })}
                    </div>
                    {isOwner && !isLocked && (
                      <button onClick={() => { setUploadingToFileName(activeAsset?.fileName || null); versionFileInputRef.current?.click(); setIsVersionMenuOpen(false); }} className="w-full p-3 text-left text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400 font-bold uppercase tracking-widest border-t border-zinc-800 transition-colors border-dashed">
                        + Upload New Version
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 text-xs font-bold rounded-sm tracking-widest shrink-0">
            <span className={`${project?.status === 'APPROVED' ? 'text-emerald-500' : project?.status === 'CHANGES_REQUESTED' ? 'text-rose-500' : 'text-indigo-400'}`}>{project?.status?.replace("_", " ")}</span>
          </div>
          
          {isOwner && (
            <button onClick={() => setIsInviteModalOpen(true)} className="px-4 py-1.5 font-bold rounded-sm transition-all duration-300 text-xs tracking-widest flex items-center justify-center shrink-0 bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.3)] ml-1">
              SHARE LINK
            </button>
          )}
        </div>
      </header>

      {activeAssetStack && activeAsset && activeAssetStack[0].id !== activeAsset.id && !isCompareMode &&  (
        <div className="w-full bg-amber-500/10 text-amber-500 text-xs font-bold tracking-widest uppercase py-2 flex justify-center items-center gap-2 border-b border-amber-500/20 z-20 pointer-events-none">
          Viewing older version (v{activeAsset?.version}).
          <button onClick={() => { setActiveAssetId(activeAssetStack[0].id); }} className="underline hover:text-amber-400 ml-2 pointer-events-auto">
            Go to Latest (v{activeAssetStack[0].version})
          </button>
        </div>
      )}
    </>
  );
}