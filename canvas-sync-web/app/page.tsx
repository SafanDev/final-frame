"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

// Helper to format timestamps into "2 hours ago", "Just now", etc.
const timeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
};

// Helper to colorize and format the status
const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; colors: string }> = {
    // Upgraded to a premium Indigo instead of Amber!
    IN_REVIEW: { label: "In Review", colors: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30" },
    CHANGES_REQUESTED: { label: "Changes Req", colors: "bg-rose-500/10 text-rose-500 border-rose-500/30" },
    APPROVED: { label: "Approved", colors: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  };
  const config = map[status] || map.IN_REVIEW;

  return (
    <span className={`text-[9px] px-2 py-0.5 font-bold uppercase tracking-widest rounded-sm border ${config.colors}`}>
      {config.label}
    </span>
  );
};

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (session?.user) {
      fetchProjects();
    }
  }, [session, status]);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${(session?.user as any).id}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Failed to fetch projects", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch("http://localhost:5000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProjectTitle,
          description: newProjectDesc,
          ownerId: (session?.user as any).id,
        }),
      });

      if (res.ok) {
        setNewProjectTitle("");
        setNewProjectDesc("");
        setIsModalOpen(false);
        fetchProjects(); 
      }
    } catch (error) {
      console.error("Failed to create project", error);
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading || status === "loading") {
    return (
      <div className="min-h-screen bg-[#050505] pt-10 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse flex justify-between items-end mb-12 border-b border-zinc-800 pb-6">
            <div>
              <div className="h-10 w-64 bg-zinc-900 rounded-sm mb-4"></div>
              <div className="h-4 w-48 bg-zinc-900 rounded-sm"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 bg-[#0a0a0a] border border-zinc-800 rounded-sm animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const userId = (session?.user as any).id;
  const ownedProjects = projects.filter(p => p.ownerId === userId);
  const sharedProjects = projects.filter(p => p.ownerId !== userId);

  return (
    <div className="min-h-screen bg-[#050505] pt-10 pb-20 px-6 relative">
      
      {/* --- CREATE PROJECT MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm px-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 p-8 rounded-sm shadow-2xl max-w-md w-full animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-white font-bold text-xl tracking-tight">Create Workspace</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">✕</button>
            </div>
            
            <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase mb-2 block">Project Title</label>
                <input 
                  type="text" autoFocus required
                  placeholder=""
                  value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)}
                  className="w-full bg-[#111] border border-zinc-800 text-white rounded-sm px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase mb-2 block">Description (Optional)</label>
                <textarea 
                  placeholder="Brief context for the team..."
                  value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full bg-[#111] border border-zinc-800 text-white rounded-sm px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors resize-none h-24"
                />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">Cancel</button>
                <button type="submit" disabled={isCreating} className="px-6 py-2 text-xs font-bold bg-emerald-500 text-[#050505] hover:bg-emerald-400 rounded-sm transition-colors uppercase tracking-widest disabled:opacity-50">
                  {isCreating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-12 border-b border-zinc-800 pb-6 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-6 bg-emerald-500 flex items-center justify-center rounded-sm">
                <div className="h-2 w-2 bg-[#050505]"></div>
              </div>
              <span className="text-sm font-bold text-white tracking-widest uppercase">Pin<span className="text-emerald-500">Sight</span></span>
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight">Command Center</h1>
            <p className="text-zinc-500 font-mono text-sm mt-2 uppercase tracking-widest">
              Welcome back, {session?.user?.name}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="px-5 py-2.5 bg-white text-[#050505] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-zinc-200 transition-colors"
            >
              + New Project
            </button>
            <div className="w-[1px] h-8 bg-zinc-800"></div>
            <button onClick={() => signOut()} className="text-xs text-zinc-500 hover:text-red-500 font-bold tracking-widest transition-colors uppercase">
              Logout
            </button>
          </div>
        </div>

        {/* --- MY WORKSPACES --- */}
        <div className="mb-16">
          <h2 className="text-zinc-400 text-sm tracking-widest uppercase font-bold mb-6 flex items-center gap-3">
            <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
            My Workspaces
          </h2>
          
          {ownedProjects.length === 0 ? (
            <div className="bg-[#0a0a0a] border border-zinc-800 border-dashed rounded-sm p-12 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-600 mb-4 text-2xl">✦</div>
              <h3 className="text-white font-bold text-lg tracking-tight mb-2">No projects yet</h3>
              <p className="text-zinc-500 text-sm mb-6 max-w-sm">Create your first workspace to start uploading assets and collaborating with clients.</p>
              <button onClick={() => setIsModalOpen(true)} className="px-6 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500 hover:text-[#050505] font-bold text-xs uppercase tracking-widest rounded-sm transition-colors">
                Create Workspace
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {ownedProjects.map((project) => {
                // Calculate Files & Pins
                const fileCount = project.assets?.length || 0;
                const pinCount = project.assets?.reduce((sum: number, a: any) => sum + (a.comments?.length || 0), 0) || 0;

                return (
                  <Link href={`/project/${project.id}`} key={project.id} className="block group">
                    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-sm h-[200px] flex flex-col transition-all group-hover:border-emerald-500/50 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.05)] group-hover:-translate-y-1 relative overflow-hidden">
                      
                      <div className="h-1 w-full bg-gradient-to-r from-emerald-500/50 to-transparent"></div>
                      
                      <div className="p-5 flex flex-col h-full">
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <h3 className="text-lg font-bold text-white group-hover:text-emerald-500 transition-colors line-clamp-1" title={project.title}>
                            {project.title}
                          </h3>
                        </div>
                        
                        <StatusBadge status={project.status} />
                        
                        <p className="text-zinc-500 text-xs mt-3 line-clamp-2">
                          {project.description || "No description provided."}
                        </p>
                        
                        <div className="mt-auto pt-4 flex flex-col gap-2 border-t border-zinc-800/50">
                          
                          {/* METADATA: FILES & PINS */}
                          <div className="flex items-center gap-4 text-[10px] text-zinc-400 font-mono tracking-widest uppercase">
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              {fileCount} Files
                            </span>
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              {pinCount} Pins
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="text-[9px] text-zinc-600 font-mono tracking-widest uppercase">
                              Updated {timeAgo(project.updatedAt)}
                            </div>
                            <div className="text-zinc-600 group-hover:text-emerald-500 transition-colors">→</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* --- SHARED WITH ME --- */}
        {sharedProjects.length > 0 && (
          <div>
            <h2 className="text-zinc-400 text-sm tracking-widest uppercase font-bold mb-6 flex items-center gap-3">
              <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
              Shared With Me
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sharedProjects.map((project) => {
                const fileCount = project.assets?.length || 0;
                const pinCount = project.assets?.reduce((sum: number, a: any) => sum + (a.comments?.length || 0), 0) || 0;

                return (
                  <Link href={`/project/${project.id}`} key={project.id} className="block group">
                    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-sm h-[200px] flex flex-col transition-all group-hover:border-blue-500/50 group-hover:shadow-[0_0_30px_rgba(59,130,246,0.05)] group-hover:-translate-y-1 overflow-hidden">
                      
                      <div className="h-1 w-full bg-gradient-to-r from-blue-500/50 to-transparent"></div>
                      
                      <div className="p-5 flex flex-col h-full">
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <h3 className="text-lg font-bold text-white group-hover:text-blue-500 transition-colors line-clamp-1" title={project.title}>
                            {project.title}
                          </h3>
                        </div>
                        
                        <StatusBadge status={project.status} />
                        
                        <p className="text-zinc-500 text-xs mt-3 line-clamp-2">
                          {project.description || "No description provided."}
                        </p>
                        
                        <div className="mt-auto pt-4 flex flex-col gap-2 border-t border-zinc-800/50">
                          <div className="flex items-center gap-4 text-[10px] text-zinc-400 font-mono tracking-widest uppercase">
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              {fileCount} Files
                            </span>
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              {pinCount} Pins
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-[8px] font-bold border border-blue-500/30">
                                G
                              </span>
                              <span className="text-[9px] text-zinc-500 font-mono tracking-widest uppercase">
                                Guest
                              </span>
                            </div>
                            <div className="text-zinc-600 group-hover:text-blue-500 transition-colors">→</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}