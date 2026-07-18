"use client";

// ============================================================================
// DASHBOARD VIEW
// ============================================================================
// Location: app/page.tsx
// Upgrades: 
// 1. Framer Motion integration for fluid, native-feeling modal animations.
// 2. Sonner Toaster integration for instant, premium success/error feedback.
// 3. Staggered, smooth layout transitions for project cards.
// ============================================================================

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { toast } from "sonner"; // Premium Notifications
import { API_URL, formatAppDate } from "@/utils/helpers";

export default function DashboardView() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [viewTab, setViewTab] = useState<"ACTIVE" | "CLOSED">("ACTIVE");
  const [isProcessing, setIsProcessing] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [projectToRename, setProjectToRename] = useState<{id: string, title: string} | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: "", title: "" });

  const accessToken = (session?.user as any)?.accessToken;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (session?.user && accessToken) {
      fetchProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, router, accessToken]);

  const fetchProjects = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_URL}/api/projects/${(session?.user as any).id}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (res.ok) setProjects(await res.json());
    } catch (e) {
      toast.error("Failed to sync projects");
    } finally {
      setIsLoading(false);
    }
  };

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim() || !accessToken) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ title: newProjectTitle, ownerId: (session?.user as any).id })
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Workspace created");
        router.push(`/project/${data.id}`);
      } else {
        toast.error("Failed to create workspace");
        setIsProcessing(false);
      }
    } catch (e) {
      toast.error("Network error");
      setIsProcessing(false);
    }
  };

  const handleRenameProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToRename || !newProjectTitle.trim() || !accessToken) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectToRename.id}`, {
        method: "PUT", 
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({ title: newProjectTitle }),
      });
      if (res.ok) {
        await fetchProjects();
        toast.success("Project renamed");
        setIsRenameModalOpen(false);
        setProjectToRename(null);
        setNewProjectTitle("");
      } else {
        toast.error("Failed to rename project");
      }
    } catch (error) { 
      toast.error("Network error");
    } finally { 
      setIsProcessing(false); 
    }
  };

  const toggleArchiveStatus = async (projectId: string, currentStatus: boolean) => {
    if (!accessToken) return;
    setOpenDropdownId(null); 
    try {
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, isArchived: !currentStatus } : p));
      
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT", 
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({ isArchived: !currentStatus }),
      });

      if (!res.ok) {
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, isArchived: currentStatus } : p));
        toast.error("Failed to update status");
      } else {
        toast.success(!currentStatus ? "Project Closed" : "Project Re-Opened");
        fetchProjects(); 
      }
    } catch (error) { 
      toast.error("Network error");
    }
  };

  const executeDeleteProject = async () => {
    if (!deleteConfirm.id || !accessToken) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${deleteConfirm.id}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (res.ok) {
        await fetchProjects();
        toast.success("Project permanently deleted");
        setDeleteConfirm({ isOpen: false, id: "", title: "" });
      } else {
        toast.error("Failed to delete project");
      }
    } catch (e) { 
      toast.error("Network error");
    } finally { 
      setIsProcessing(false); 
    }
  };

  const openRenameModal = (id: string, currentTitle: string) => {
    setOpenDropdownId(null);
    setProjectToRename({ id, title: currentTitle });
    setNewProjectTitle(currentTitle);
    setIsRenameModalOpen(true);
  };

  const activeProjects = useMemo(() => projects.filter(p => !p.isArchived), [projects]);
  const closedProjects = useMemo(() => projects.filter(p => p.isArchived), [projects]);
  const displayedProjects = viewTab === "ACTIVE" ? activeProjects : closedProjects;

  // --- ANIMATION VARIANTS (Apple-like Spring Physics) ---
// --- ANIMATION VARIANTS (Apple-like Spring Physics) ---
  const backdropVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95, y: 15 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } },
    exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.15 } }
  };

  if (isLoading || status === "loading") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#050505] text-emerald-500 min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
        <span className="font-mono text-[10px] tracking-widest uppercase">Loading Projects...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#050505] text-white p-6 md:p-10 max-w-7xl mx-auto w-full relative">
      
      {openDropdownId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenDropdownId(null)}></div>
      )}

      {/* --- FLUID MODALS WITH ANIMATEPRESENCE --- */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <motion.div 
            variants={backdropVariants} initial="hidden" animate="visible" exit="hidden"
            className="fixed inset-0 z-1000 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4"
          >
            <motion.div 
              variants={modalVariants}
              role="dialog" aria-labelledby="create-project-title" 
              className="bg-[#0a0a0a] border border-zinc-800 p-8 rounded-sm shadow-2xl max-w-md w-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-emerald-600 to-emerald-400"></div>
              <h3 id="create-project-title" className="text-white font-bold text-xl mb-2 tracking-tight">Create a Project</h3>
              <p className="text-zinc-400 text-sm mb-6">Enter a simple, clear name for this design.</p>
              <form onSubmit={createProject}>
                <input type="text" autoFocus disabled={isProcessing} placeholder="e.g., Marketing Website" value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)} className="w-full bg-[#050505] border border-zinc-700 text-white rounded-sm px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors shadow-inner mb-6"/>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => { setIsCreateModalOpen(false); setNewProjectTitle(""); }} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors" disabled={isProcessing}>Cancel</button>
                  <button type="submit" disabled={!newProjectTitle.trim() || isProcessing} className="px-5 py-2.5 text-xs font-bold bg-emerald-500 text-[#050505] hover:bg-emerald-400 rounded-sm transition-all disabled:opacity-50 flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    {isProcessing ? <><div className="w-3 h-3 border-2 border-[#050505] border-t-transparent rounded-full animate-spin"></div> Creating...</> : "Create Project"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRenameModalOpen && (
          <motion.div 
            variants={backdropVariants} initial="hidden" animate="visible" exit="hidden"
            className="fixed inset-0 z-1000 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4"
          >
            <motion.div 
              variants={modalVariants}
              role="dialog" aria-labelledby="rename-project-title" 
              className="bg-[#0a0a0a] border border-zinc-800 p-8 rounded-sm shadow-2xl max-w-md w-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-blue-600 to-blue-400"></div>
              <h3 id="rename-project-title" className="text-white font-bold text-xl mb-2 tracking-tight">Rename Project</h3>
              <p className="text-zinc-400 text-sm mb-6">Update the title for clarity.</p>
              <form onSubmit={handleRenameProject}>
                <input type="text" autoFocus disabled={isProcessing} value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)} className="w-full bg-[#050505] border border-zinc-700 text-white rounded-sm px-4 py-3 text-sm focus:border-blue-500 focus:outline-none transition-colors shadow-inner mb-6"/>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => { setIsRenameModalOpen(false); setNewProjectTitle(""); setProjectToRename(null); }} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors" disabled={isProcessing}>Cancel</button>
                  <button type="submit" disabled={!newProjectTitle.trim() || isProcessing || newProjectTitle === projectToRename?.title} className="px-5 py-2.5 text-xs font-bold bg-blue-500 text-[#050505] hover:bg-blue-400 rounded-sm transition-all disabled:opacity-50 flex items-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                    {isProcessing ? <><div className="w-3 h-3 border-2 border-[#050505] border-t-transparent rounded-full animate-spin"></div> Saving...</> : "Save Name"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm.isOpen && (
          <motion.div 
            variants={backdropVariants} initial="hidden" animate="visible" exit="hidden"
            className="fixed inset-0 z-1000 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4"
          >
            <motion.div 
              variants={modalVariants}
              role="alertdialog" aria-labelledby="delete-project-title" 
              className="bg-[#0a0a0a] border border-zinc-800 p-8 rounded-sm shadow-2xl max-w-md w-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
              <h3 id="delete-project-title" className="text-white font-bold text-xl mb-2 tracking-tight">Delete Project?</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                You are about to permanently delete <strong className="text-white">{deleteConfirm.title}</strong>. All files, feedback, and history will be erased immediately. This cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirm({ isOpen: false, id: "", title: "" })} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors" disabled={isProcessing}>Cancel</button>
                <button onClick={executeDeleteProject} disabled={isProcessing} className="px-5 py-2.5 text-xs font-bold bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-sm transition-all disabled:opacity-50 flex items-center gap-2">
                  {isProcessing ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- HEADER --- */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-end mb-10 pb-6 border-b border-zinc-800/50 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Projects</h1>
          <p className="text-zinc-400 text-sm font-medium">Manage your active and completed design work.</p>
        </div>
        <button onClick={() => { setIsCreateModalOpen(true); setNewProjectTitle(""); }} aria-label="Create a new project" className="bg-emerald-500 text-[#050505] px-6 py-2.5 rounded-sm font-bold text-sm hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 w-full md:w-auto text-center">
          + Create Project
        </button>
      </header>

      {/* --- TABS --- */}
      <nav aria-label="Project Views" className="flex bg-[#111] p-1 rounded-sm w-fit border border-zinc-800 mb-8 shadow-inner">
        <button onClick={() => setViewTab("ACTIVE")} aria-current={viewTab === "ACTIVE"} className={`px-5 py-2 text-xs font-bold rounded-sm transition-all duration-200 ${viewTab === "ACTIVE" ? "bg-[#222] text-white shadow-sm border border-zinc-700/50" : "text-zinc-500 hover:text-zinc-300"}`}>
          Active ({activeProjects.length})
        </button>
        <button onClick={() => setViewTab("CLOSED")} aria-current={viewTab === "CLOSED"} className={`px-5 py-2 text-xs font-bold rounded-sm transition-all duration-200 ${viewTab === "CLOSED" ? "bg-[#222] text-white shadow-sm border border-zinc-700/50" : "text-zinc-500 hover:text-zinc-300"}`}>
          Closed ({closedProjects.length})
        </button>
      </nav>

      {/* --- GRID WITH ANIMATED LAYOUT --- */}
      <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {displayedProjects.map((p) => {
            const isOwner = (session?.user as any)?.id === p.ownerId;
            const isMenuOpen = openDropdownId === p.id;

            return (
              <motion.article 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                key={p.id} 
                className={`bg-[#0a0a0a] border rounded-md p-6 relative overflow-visible transition-shadow duration-300 shadow-md hover:shadow-2xl ${p.isArchived ? "border-zinc-800/40 opacity-75 hover:opacity-100" : "border-zinc-800 hover:border-zinc-600 hover:-translate-y-1"} ${isMenuOpen ? "z-50 ring-1 ring-zinc-700" : "z-10"}`}
              >
                <div className={`absolute top-0 left-0 w-full h-1 rounded-t-md transition-colors duration-300 ${p.isArchived ? "bg-zinc-800" : "bg-emerald-500/50 group-hover:bg-emerald-500"}`}></div>
                
                <div className="flex justify-between items-start mb-2 relative">
                  <h2 onClick={() => router.push(`/project/${p.id}`)} className={`text-xl font-bold pr-8 cursor-pointer transition-colors ${p.isArchived ? "text-zinc-400 hover:text-white" : "text-zinc-100 hover:text-white"} tracking-tight`}>
                    {p.title}
                  </h2>
                  
                  {isOwner && (
                    <div className="absolute top-0 right-0 z-60">
                      <button aria-label={`Options for ${p.title}`} aria-expanded={isMenuOpen} onClick={(e) => { e.stopPropagation(); setOpenDropdownId(isMenuOpen ? null : p.id); }} className={`p-1.5 transition-colors rounded-sm ${isMenuOpen ? "text-white bg-zinc-800" : "text-zinc-500 hover:text-white hover:bg-zinc-800"}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                      </button>
                      
                      <AnimatePresence>
                        {isMenuOpen && (
                          <motion.div 
                            initial={{ opacity: 0, y: -5, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -5, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="absolute right-0 mt-1 w-44 bg-[#111] border border-zinc-700 rounded-sm shadow-2xl py-1.5 z-100 origin-top-right"
                          >
                            <button onClick={(e) => { e.stopPropagation(); openRenameModal(p.id, p.title); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">Rename Project</button>
                            <button onClick={(e) => { e.stopPropagation(); toggleArchiveStatus(p.id, p.isArchived); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">{p.isArchived ? "Re-Open Project" : "Close Project"}</button>
                            
                            {p.status !== 'APPROVED' ? (
                              <><div className="h-px bg-zinc-800 my-1"></div><button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({isOpen: true, id: p.id, title: p.title}); setOpenDropdownId(null); }} className="w-full text-left px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">Delete Permanently</button></>
                            ) : (
                              <><div className="h-px bg-zinc-800 my-1"></div><div className="w-full text-left px-4 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest cursor-not-allowed bg-zinc-900/50" title="Approved projects cannot be deleted to preserve the audit log.">🔒 Delete Locked</div></>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                <div onClick={() => router.push(`/project/${p.id}`)} className="cursor-pointer">
                  <div className="flex justify-between items-center mt-8">
                    <span className="text-[11px] text-zinc-500 font-medium">{formatAppDate(p.updatedAt)}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-sm ${p.isArchived ? 'bg-zinc-900 text-zinc-500 border border-zinc-800' : p.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                      {p.isArchived ? 'CLOSED' : p.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
        
        {/* --- EMPTY STATES --- */}
        {displayedProjects.length === 0 && viewTab === "ACTIVE" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full flex flex-col items-center justify-center py-24 text-zinc-500 border border-dashed border-zinc-800/80 rounded-sm bg-[#080808]/50 hover:bg-[#0a0a0a] hover:border-zinc-700 transition-colors cursor-pointer" onClick={() => { setIsCreateModalOpen(true); setNewProjectTitle(""); }}>
            <div className="h-16 w-16 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center mb-5 shadow-inner text-zinc-600">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
            </div>
            <p className="font-medium text-sm text-zinc-400 mb-2">No active projects found.</p>
            <span className="text-emerald-500 hover:text-emerald-400 text-sm font-bold transition-colors">Create your first project &rarr;</span>
          </motion.div>
        )}

        {displayedProjects.length === 0 && viewTab === "CLOSED" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full flex flex-col items-center justify-center py-24 text-zinc-500 border border-dashed border-zinc-800/80 rounded-sm bg-[#080808]/50">
            <div className="h-16 w-16 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center mb-5 shadow-inner text-zinc-700">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            </div>
            <p className="font-medium text-sm text-zinc-500">You don't have any closed projects.</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}