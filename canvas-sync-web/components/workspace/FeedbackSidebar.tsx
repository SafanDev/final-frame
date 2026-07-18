// web/components/workspace/FeedbackSidebar.tsx
"use client";

import { useState, MouseEvent } from "react";
import { useSession } from "next-auth/react";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { API_URL, getAssetType, parseComment } from "@/utils/helpers";

export default function FeedbackSidebar() {
  const { data: session } = useSession();
  const { 
    projectId, project, isOwner, isLocked, activeAssetId, 
    fetchProjectDetails, activeAsset, filteredComments 
  } = useWorkspaceData();
  
  const { 
    isCompareMode, rightSidebarTab, setRightSidebarTab, 
    activeTab, setActiveTab, activePinId, setActivePinId 
  } = useWorkspaceUI();

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiCooldown, setAiCooldown] = useState(0);
  const [errorToast, setErrorToast] = useState("");

  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; targetId: string }>({ isOpen: false, targetId: "" });
  
  const [generalCommentText, setGeneralCommentText] = useState("");
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  const currentUserId = (session?.user as any)?.id;
  const assetType = getAssetType(activeAsset?.fileUrl || "");
  const isSpatialAsset = assetType === 'image' || assetType === 'video' || assetType === 'code' || assetType === 'pdf';

  const generateAISummary = async () => {
    if (aiCooldown > 0) return; 
    if (filteredComments.length === 0) { 
      setErrorToast("No feedback found to summarize."); 
      setTimeout(() => setErrorToast(""), 4000); 
      return; 
    }
    
    setIsSummarizing(true); 
    setAiSummary(null);

    const textComments = filteredComments.map((c: any) => parseComment(c.text).text).filter((t: string) => t.trim() !== "");
    if (textComments.length === 0) { 
      setErrorToast("No text feedback found."); 
      setTimeout(() => setErrorToast(""), 4000); 
      setIsSummarizing(false); 
      return; 
    }

    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/summary`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requestorRole: isOwner ? "DESIGNER" : "CLIENT" }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setAiSummary(data.summary);
      } else if (res.status === 429) {
        setErrorToast("AI Engine Limit Reached. Try again later."); 
        setTimeout(() => setErrorToast(""), 4000);
        setAiCooldown(60);
        const countdown = setInterval(() => { 
          setAiCooldown((prev) => { 
            if (prev <= 1) { clearInterval(countdown); return 0; } 
            return prev - 1; 
          }); 
        }, 1000);
      } else { 
        setErrorToast(data.error || "AI Engine connection failed."); 
        setTimeout(() => setErrorToast(""), 4000); 
      }
    } catch (error) { 
      console.error("AI Error:", error); 
    } finally { 
      setIsSummarizing(false); 
    }
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
        method: "PUT", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: newRawText, projectId }),
      });
      if (res.ok) { 
        await fetchProjectDetails(true);
        setEditingCommentId(null); 
        setEditCommentText(""); 
      }
    } catch (error) { console.error(error); }
  };

  const handleToggleResolve = async (commentId: string, isCurrentlyResolved: boolean, e: MouseEvent) => {
    e.stopPropagation(); 
    try {
      await fetch(`${API_URL}/api/comments/${commentId}/resolve`, {
        method: "PATCH", 
        headers: { "Content-Type": "application/json" }, 
        credentials: "include",
        body: JSON.stringify({ projectId, isResolved: !isCurrentlyResolved }),
      });
      await fetchProjectDetails(true);
    } catch (error) { console.error(error); }
  };

  const executeDelete = async () => {
    if (!confirmDialog.targetId) return;
    try {
      await fetch(`${API_URL}/api/comments/${confirmDialog.targetId}`, { 
        method: "DELETE",
        credentials: "include"
      });
      await fetchProjectDetails(true); 
    } catch (error) { 
      console.error(`Deletion failure:`, error); 
    } finally { 
      setConfirmDialog({ isOpen: false, targetId: "" }); 
    }
  };

  const requestCommentDelete = (commentId: string, e: MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({ isOpen: true, targetId: commentId });
  };

  const handleSaveGeneralComment = async () => {
    if (!generalCommentText.trim() || !activeAsset || !currentUserId) return;
    setIsSavingGeneral(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/assets/${activeAsset.id}/comments`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: generalCommentText, xPos: 0, yPos: 0, authorId: currentUserId, projectId }),
      });
      if (res.ok) { 
        setGeneralCommentText(""); 
        await fetchProjectDetails(true);
      } else { 
        setErrorToast("Failed to save comment."); 
        setTimeout(() => setErrorToast(""), 4000); 
      }
    } catch (error) { 
      console.error(error); 
    } finally { 
      setIsSavingGeneral(false); 
    }
  };

  const handleCardClick = (commentId: string) => {
    if (isCompareMode) return;
    setActivePinId(commentId);
  };

  return (
    <>
      {errorToast && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-100 bg-red-500 border border-red-400 text-white px-6 py-2 rounded-sm text-xs font-bold tracking-widest shadow-2xl animate-fade-in-down">{errorToast}</div>}

      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-100000 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4">
          <div role="alertdialog" className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-sm shadow-2xl max-w-sm w-full animate-fade-in-up">
            <h3 className="text-white font-bold text-lg mb-2 tracking-tight">Delete Pin?</h3>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed">Are you sure you want to permanently remove this feedback?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDialog({ isOpen: false, targetId: "" })} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">Cancel</button>
              <button onClick={executeDelete} className="px-4 py-2 text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-[#050505] rounded-sm transition-colors uppercase tracking-widest">Delete</button>
            </div>
          </div>
        </div>
      )}

      <aside className="w-[320px] md:w-95 shrink-0 flex flex-col bg-[#050505] border-l border-zinc-800 z-10 shadow-2xl relative">
        
        <div className="shrink-0 border-b border-zinc-800 bg-[#0a0a0a] flex w-full">
          <button onClick={() => setRightSidebarTab("FEEDBACK")} className={`flex-1 py-4 text-xs tracking-widest uppercase font-bold transition-all border-b-2 ${rightSidebarTab === "FEEDBACK" ? "border-emerald-500 text-emerald-500 bg-[#111]" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#0f0f0f]"}`}>Feedback</button>
          <button onClick={() => setRightSidebarTab("ACTIVITY")} className={`flex-1 py-4 text-xs tracking-widest uppercase font-bold transition-all border-b-2 ${rightSidebarTab === "ACTIVITY" ? "border-emerald-500 text-emerald-500 bg-[#111]" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#0f0f0f]"}`}>Activity</button>
        </div>

        {rightSidebarTab === "FEEDBACK" && (
          <div className="flex-1 flex flex-col min-h-0">
            
            <div className="p-4 flex justify-between items-center border-b border-zinc-800 shrink-0 bg-[#080808]">
              <button onClick={generateAISummary} disabled={isSummarizing || filteredComments.length === 0 || aiCooldown > 0} className="group flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500 hover:text-[#050505] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(99,102,241,0.2)]" title="Generate Actionable Summary">
                <svg className="w-3.5 h-3.5 group-hover:animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span className="text-xs font-bold uppercase tracking-widest">{isSummarizing ? "Syncing..." : aiCooldown > 0 ? `Wait ${aiCooldown}s` : "AI Sync"}</span>
              </button>
              <span className="text-zinc-400 text-xs font-mono bg-[#0a0a0a] border border-zinc-800 px-3 py-1 rounded-sm font-bold">{filteredComments.length || 0}</span>
            </div>

            {activeAsset && (!isSpatialAsset) && !isLocked && !isCompareMode && (
              <div className="p-4 bg-[#0a0a0a] border-b border-zinc-800 shrink-0">
                <textarea 
                  className="w-full bg-[#050505] text-white border border-zinc-700 rounded-sm p-3 text-sm focus:border-emerald-500 focus:outline-none resize-none shadow-inner mb-2" 
                  rows={3} 
                  placeholder="Leave general feedback..." 
                  value={generalCommentText} 
                  onChange={(e) => setGeneralCommentText(e.target.value)} 
                />
                <div className="flex justify-end items-center">
                  <button onClick={handleSaveGeneralComment} disabled={isSavingGeneral || !generalCommentText.trim()} className={`text-xs text-[#050505] px-4 py-1.5 font-bold uppercase tracking-widest rounded-sm disabled:opacity-50 transition-colors shadow-sm ${isOwner ? "bg-blue-500 hover:bg-blue-400" : "bg-emerald-500 hover:bg-emerald-400"}`}>
                    {isSavingGeneral ? "..." : "POST FEEDBACK"}
                  </button>
                </div>
              </div>
            )}

            <div className="px-4 pb-4 pt-4 flex gap-2 shrink-0 bg-[#080808]">
              <button onClick={() => setActiveTab("ALL")} className={`flex-1 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors border ${activeTab === 'ALL' ? 'bg-zinc-800 text-white border-zinc-700' : 'text-zinc-500 hover:bg-[#0a0a0a] border-zinc-800/50 hover:border-zinc-700'}`}>All</button>
              <button onClick={() => setActiveTab("CLIENT")} className={`flex-1 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors border ${activeTab === 'CLIENT' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'text-zinc-500 hover:bg-[#0a0a0a] border-zinc-800/50 hover:border-zinc-700'}`}>Client</button>
              <button onClick={() => setActiveTab("DESIGNER")} className={`flex-1 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors border ${activeTab === 'DESIGNER' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' : 'text-zinc-500 hover:bg-[#0a0a0a] border-zinc-800/50 hover:border-zinc-700'}`}>Internal</button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-3 bg-[#080808]">
              {aiSummary && (
                <div className="mb-4 bg-linear-to-br from-[#111] to-[#0a0a0a] border border-indigo-500/30 rounded-sm shadow-2xl relative overflow-hidden animate-fade-in-up">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                  <div className="p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold tracking-widest uppercase text-indigo-400 flex items-center gap-2">
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
                    <div 
                      key={comment.id} 
                      onClick={() => !isEditing && handleCardClick(comment.id)} 
                      className={`group p-4 rounded-sm border transition-all duration-300 shadow-sm cursor-pointer relative ${comment.isResolved ? "bg-[#050505] border-zinc-900 opacity-60" : isActive ? "bg-[#111] border-zinc-500 scale-[1.02] shadow-xl" : "bg-[#0a0a0a] border-zinc-800 hover:border-zinc-600"}`}
                    >
                      {isAuthor && !comment.isResolved && !isEditing && !isLocked && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-[#111] border border-zinc-700 rounded-sm overflow-hidden shadow-lg z-20">
                          <button onClick={(e) => { e.stopPropagation(); setEditCommentText(parsed.text); setEditingCommentId(comment.id); }} className="px-2 py-1.5 text-zinc-400 hover:text-white hover:bg-blue-500/20 transition-colors border-r border-zinc-700" aria-label="Edit Pin">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={(e) => requestCommentDelete(comment.id, e)} className="px-2 py-1.5 text-zinc-400 hover:text-white hover:bg-red-500/20 transition-colors" aria-label="Delete Pin">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}

                      <div className="flex items-start gap-3 pr-4">
                        {isSpatial ? (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-all ${comment.isResolved ? "bg-zinc-900 text-zinc-500" : `${pinColor} text-[#050505]`} ${isActive ? 'ring-2 ring-white/50' : ''}`}>{index + 1}</div>
                        ) : (
                          <div className="w-6 h-6 rounded-sm bg-zinc-800 flex items-center justify-center text-xs text-zinc-500 shrink-0 mt-0.5"></div>
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
                                <button onClick={(e) => { e.stopPropagation(); setEditingCommentId(null); }} className="text-xs text-zinc-500 hover:text-white uppercase tracking-widest font-bold transition-colors">Cancel</button>
                                <button onClick={(e) => { e.stopPropagation(); handleUpdateComment(comment.id, comment.text); }} className="text-xs bg-emerald-500 text-[#050505] px-4 py-1.5 rounded-sm uppercase tracking-widest font-bold hover:bg-emerald-400 transition-colors">Save</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              {parsed.audioUrl ? (
                                <div className="mb-2 bg-[#111] p-3 rounded-sm border border-zinc-800/80 shadow-inner">
                                  <div className="flex items-center gap-2 mb-3">
                                    <span className={`text-xs uppercase font-mono tracking-widest font-bold flex items-center gap-1.5 ${isDesignerComment ? 'text-blue-500' : 'text-emerald-500'}`}>
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
                                  <p className={`text-[14px] leading-relaxed wrap-break-word ${comment.isResolved ? "text-zinc-500 line-through" : "text-white font-medium"}`}>{parsed.text}</p>
                                )
                              )}
                            </div>
                          )}
                          
                          {parsed.timestamp !== null && !isEditing && (
                            <div className="mt-2 text-xs font-mono text-zinc-500 bg-zinc-900 inline-block px-2 py-0.5 rounded-sm border border-zinc-800">
                              @ {Math.floor(parsed.timestamp / 60)}:{(parsed.timestamp % 60).toFixed(1).padStart(4, '0')}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800/50">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-zinc-400 font-mono truncate max-w-30" title={comment.author?.name || comment.author?.email}>{comment.author?.name || "Guest"}</span>
                              <span className={`text-[9px] w-fit font-bold uppercase tracking-widest ${isDesignerComment ? "text-blue-500" : "text-emerald-500"}`}>{isDesignerComment ? "Designer" : "Client"}</span>
                            </div>
                            
                            {!comment.isResolved && !isEditing && !isLocked ? (
                              isOwner ? (
                                <button onClick={(e) => handleToggleResolve(comment.id, comment.isResolved, e)} className="text-xs text-emerald-500 hover:bg-emerald-500 hover:text-[#050505] uppercase tracking-widest font-bold transition-all bg-emerald-500/10 px-3 py-1.5 rounded-sm border border-emerald-500/30">
                                  ✓ Resolve
                                </button>
                              ) : (
                                <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest bg-zinc-900 px-2 py-1 rounded-sm border border-zinc-800">Pending</span>
                              )
                            ) : comment.isResolved ? (
                              <div className="flex items-center gap-3">
                                {isOwner && !isLocked && (
                                  <button onClick={(e) => handleToggleResolve(comment.id, comment.isResolved, e)} className="text-xs text-zinc-500 hover:text-white transition-colors underline uppercase tracking-widest font-bold">Re-open</button>
                                )}
                                <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest font-bold">✓ Resolved</span>
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
                        <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
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
    </>
  );
}