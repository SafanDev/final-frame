// web/components/workspace/AssetSidebar.tsx
"use client";

import { useState, useRef, MouseEvent } from "react";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { API_URL, getAssetType } from "@/utils/helpers";
import { useFileUpload } from "@/hooks/useFileUpload";

const assetCategories = [
  { id: 'image', title: 'Images' },
  { id: 'pdf', title: 'Documents' },
  { id: 'code', title: 'Source Code' },
  { id: 'video', title: 'Video' },
];

const AssetIcon = ({ type, isActive }: { type: string, isActive: boolean }) => {
  const color = isActive ? "text-emerald-500" : "text-zinc-400 group-hover:text-zinc-300";
  const className = `w-4 h-4 transition-colors ${color}`;
  
  switch (type) {
    case 'image': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    case 'video': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
    case 'code': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>;
    case 'pdf':
    default: return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
  }
};

export default function AssetSidebar() {
  const { 
    projectId, isOwner, isLocked, activeAssetId, 
    setActiveAssetId, fetchProjectDetails, assetStacks, activeAsset 
  } = useWorkspaceData();
  
  const { isAssetSidebarOpen, isCompareMode, setIsCompareMode } = useWorkspaceUI();
  const { uploadAsset } = useFileUpload();

  const [isUploading, setIsUploading] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editAssetText, setEditAssetText] = useState("");
  const [errorToast, setErrorToast] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; targetId: string }>({ isOpen: false, targetId: "" });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newVersionInputRef = useRef<HTMLInputElement>(null);
  const [targetStackName, setTargetStackName] = useState("");

  // PHASE 4: Extract Upload Logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const data = await uploadAsset(projectId, file);
      await fetchProjectDetails(true);
      setActiveAssetId(data.id);
      setIsCompareMode(false);
    } catch (error) {
      // Errors handled by hook toasts
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleNewVersionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetStackName) return;

    setIsUploading(true);
    try {
      const data = await uploadAsset(projectId, file, targetStackName);
      await fetchProjectDetails(true);
      setActiveAssetId(data.id);
      setIsCompareMode(false);
    } catch (error) {
       // Errors handled by hook toasts
    } finally {
      setIsUploading(false);
      setTargetStackName("");
      if (newVersionInputRef.current) newVersionInputRef.current.value = "";
    }
  };

  const handleRenameAsset = async (assetId: string) => {
    if (!editAssetText.trim()) { setEditingAssetId(null); return; }
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/assets/${assetId}`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileName: editAssetText }),
      });
      if (res.ok) { 
        await fetchProjectDetails(true); 
        setEditingAssetId(null); 
      } else { 
        setErrorToast("Failed to rename asset."); setTimeout(() => setErrorToast(""), 4000); 
      }
    } catch (error) { console.error("Mutation error:", error); }
  };

  const executeDelete = async () => {
    if (!confirmDialog.targetId) return;
    try {
      await fetch(`${API_URL}/api/projects/${projectId}/assets/${confirmDialog.targetId}`, { 
        method: "DELETE",
        credentials: "include"
      });
      if (activeAssetId === confirmDialog.targetId) setActiveAssetId(null);
      setIsCompareMode(false); 
      await fetchProjectDetails(true);
    } catch (error) { console.error(error); } 
    finally { setConfirmDialog({ isOpen: false, targetId: "" }); }
  };

  const requestAssetDelete = (assetId: string, e: MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({ isOpen: true, targetId: assetId });
  };

  const initRename = (assetId: string, currentName: string, e: MouseEvent) => {
    e.stopPropagation();
    if (isOwner && !isLocked) { setEditingAssetId(assetId); setEditAssetText(currentName); }
  };

  return (
    <>
      {errorToast && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-100 bg-red-500 border border-red-400 text-white px-6 py-2 rounded-sm text-xs font-bold tracking-widest shadow-2xl animate-fade-in-down">{errorToast}</div>}

      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-100000 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4">
          <div role="alertdialog" className="bg-[#0a0a0a] border border-zinc-800 p-8 rounded-sm shadow-2xl max-w-sm w-full animate-fade-in-up relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
            <h3 className="text-white font-bold text-xl mb-2 tracking-tight">Delete File?</h3>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed">This will permanently delete ALL versions of this file and instantly wipe out all associated feedback pins.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDialog({ isOpen: false, targetId: "" })} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">Cancel</button>
              <button onClick={executeDelete} className="px-5 py-2.5 text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-[#050505] rounded-sm transition-colors uppercase tracking-widest shadow-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      <input type="file" accept="image/*,video/*,application/pdf,text/plain,.js,.ts,.tsx,.json,.css,.html,.py,.md" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      <input type="file" accept="image/*,video/*,application/pdf,text/plain,.js,.ts,.tsx,.json,.css,.html,.py,.md" className="hidden" ref={newVersionInputRef} onChange={handleNewVersionUpload} />

      <aside className={`bg-[#050505] border-r border-zinc-800 flex flex-col transition-all duration-300 overflow-hidden shrink-0 z-20 ${isAssetSidebarOpen ? 'w-72' : 'w-0 border-r-0'}`}>
        
        <div className="p-5 flex justify-between items-center border-b border-zinc-800 shrink-0 bg-[#0a0a0a]">
          <h2 className="text-zinc-300 text-xs tracking-widest uppercase font-bold">Project Files</h2>
          <span className="text-zinc-400 text-xs font-mono bg-[#111] border border-zinc-800 px-2 py-1 rounded-sm">{Object.keys(assetStacks || {}).length || 0}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-5">
          {Object.keys(assetStacks || {}).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3 opacity-50">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              <div className="text-xs font-mono uppercase tracking-widest font-bold">No files uploaded</div>
            </div>
          ) : (
            assetCategories.map(category => {
              const categoryLatestAssets = Object.values(assetStacks).map(stack => stack[0]).filter((a: any) => {
                return getAssetType(a.fileUrl) === category.id;
              });

              if (categoryLatestAssets.length === 0) return null;

              return (
                <div key={category.id} className="space-y-1.5 animate-fade-in-up">
                  <h3 className="text-xs text-zinc-400 font-bold uppercase tracking-widest px-2 mb-2 flex items-center gap-2">
                    {category.title}
                    <div className="h-px bg-zinc-800 flex-1"></div>
                  </h3>
                  
                  {categoryLatestAssets.map((asset: any) => {
                    const isActiveStack = activeAsset && activeAsset.fileName === asset.fileName;
                    const isEditingAsset = editingAssetId === asset.id;
                    const type = getAssetType(asset.fileUrl);

                    return (
                      <div key={asset.id} className="flex flex-col">
                        <div onClick={() => { if(!isEditingAsset) { setActiveAssetId(asset.id); setIsCompareMode(false); } }} className={`group flex items-center justify-between p-2 rounded-sm cursor-pointer transition-all duration-200 ${isActiveStack ? 'bg-zinc-900 shadow-md ring-1 ring-zinc-800' : 'hover:bg-[#111]'}`}>
                          <div className="flex items-center gap-3 overflow-hidden w-full">
                            <div className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 transition-colors ${isActiveStack ? 'bg-emerald-500/10' : 'bg-zinc-900 group-hover:bg-zinc-800'}`}>
                              <AssetIcon type={type} isActive={!!isActiveStack} />
                            </div>
                            
                            <div className="flex flex-col truncate w-full pr-2">
                              {isEditingAsset && isOwner ? (
                                <input autoFocus value={editAssetText} onChange={(e) => setEditAssetText(e.target.value)} onBlur={() => handleRenameAsset(asset.id)} onKeyDown={(e) => e.key === 'Enter' && handleRenameAsset(asset.id)} onClick={(e) => e.stopPropagation()} className="text-sm font-medium bg-[#050505] border border-emerald-500 text-white rounded-sm px-1.5 py-0.5 outline-none w-full shadow-inner"/>
                              ) : (
                                <span onDoubleClick={(e) => initRename(asset.id, asset.fileName, e)} className={`text-sm truncate font-semibold transition-colors ${isActiveStack ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`} title={isOwner && !isLocked ? "Double-click to rename" : asset.fileName}>{asset.fileName}</span>
                              )}
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-zinc-500 font-mono uppercase font-bold tracking-widest">{type}</span>
                                {asset.version > 1 && <span className={`text-xs px-1 rounded-sm font-bold tracking-widest ${isActiveStack ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800 text-zinc-400'}`}>v{asset.version}</span>}
                              </div>
                            </div>
                          </div>
                          
                          {isOwner && !isEditingAsset && !isLocked && (
                            <div className={`flex items-center gap-0.5 transition-opacity duration-200 ${isActiveStack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              <button onClick={(e) => { e.stopPropagation(); setTargetStackName(asset.fileName); newVersionInputRef.current?.click(); }} aria-label="Upload New Version" title="Upload New Version" className="text-emerald-500 hover:text-emerald-400 p-1.5 transition-colors rounded-sm hover:bg-zinc-800">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                              </button>
                              <button onClick={(e) => initRename(asset.id, asset.fileName, e)} aria-label="Rename File" title="Rename File" className="text-zinc-500 hover:text-blue-400 p-1.5 transition-colors rounded-sm hover:bg-zinc-800">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button onClick={(e) => requestAssetDelete(asset.id, e)} aria-label="Delete File" title="Delete File" className="text-zinc-500 hover:text-red-500 p-1.5 transition-colors rounded-sm hover:bg-zinc-800">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {isActiveStack && asset.version > 1 && type === 'image' && (
                          <div className="mt-1 mb-2 pl-12 pr-2 animate-fade-in-up">
                            <button onClick={(e) => { e.stopPropagation(); setIsCompareMode(!isCompareMode); }} className={`w-full py-1.5 px-2 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-colors flex items-center justify-center gap-2 shadow-sm ${isCompareMode ? 'bg-emerald-500 text-[#050505] border-emerald-500' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-emerald-500 hover:text-emerald-500'}`}>
                              {isCompareMode ? (
                                <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg> Exit Compare</>
                              ) : (
                                <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> Compare Versions</>
                              )}
                            </button>
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
          <div className="p-4 border-t border-zinc-800 bg-[#080808] shrink-0">
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-emerald-500 text-zinc-300 hover:text-white rounded-sm font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
              {isUploading ? (
                <><div className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-emerald-500 rounded-full animate-spin"></div> Uploading...</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg> Upload File</>
              )}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}