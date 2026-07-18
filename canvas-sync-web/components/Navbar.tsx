"use client";

// ============================================================================
// GLOBAL NAVIGATION BAR
// ============================================================================
// Location: components/Navbar.tsx
// Purpose: Primary navigation for marketing and dashboard routes.
// Upgrades: Added ARIA labels for accessibility, a premium geometric SVG logo, 
// high-end typographic tracking, and seamless route guarding.
// ============================================================================

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Route Guard: Unmount if entering the isolated workspace environment
  if (pathname?.startsWith('/project/')) {
    return null;
  }

  return (
    <nav 
      aria-label="Main Navigation"
      className="w-full bg-[#050505]/95 border-b border-zinc-800/80 px-6 py-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-xl transition-all"
    >
      {/* --- LOGO GROUP --- */}
      <Link 
        href="/" 
        aria-label="FinalFrame Dashboard"
        className="flex items-center gap-3 group transition-transform hover:scale-[1.02]"
      >
        {/* Premium Geometric SVG Logo (No more basic CSS squares) */}
        <div className="flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.15)] group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-shadow rounded-md overflow-hidden">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" fill="#10B981"/>
            <path d="M9 10C9 8.89543 9.89543 8 11 8H21C22.1046 8 23 8.89543 23 10V13C23 14.1046 22.1046 15 21 15H11C9.89543 15 9 14.1046 9 13V10Z" fill="#050505"/>
            <path d="M9 19C9 17.8954 9.89543 17 11 17H17C18.1046 17 19 17.8954 19 19V22C19 23.1046 18.1046 24 17 24H11C9.89543 24 9 23.1046 9 22V19Z" fill="#050505"/>
          </svg>
        </div>
        <span className="text-xl font-extrabold text-white tracking-tight">
          Final<span className="text-emerald-500">Frame</span>
        </span>
      </Link>
      
      {/* --- NAVIGATION CONTROLS --- */}
      <div className="flex items-center gap-6">
        {session ? (
          <>
            <Link 
              href="/" 
              aria-label="Go to Dashboard"
              className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            
            <div className="flex items-center gap-4 border-l border-zinc-800/80 pl-6">
              {/* Premium User Avatar */}
              <div 
                aria-label={`Logged in as ${session.user?.name}`}
                title={session.user?.name || "User"}
                className="h-8 w-8 bg-[#0a0a0a] border border-emerald-500/50 text-emerald-500 flex items-center justify-center rounded-full font-bold text-xs shadow-[0_0_10px_rgba(16,185,129,0.1)] select-none"
              >
                {session.user?.name?.[0]?.toUpperCase() || "U"}
              </div>
              
              <button 
                onClick={() => signOut({ callbackUrl: '/login' })} 
                aria-label="Log Out securely"
                className="text-[11px] font-bold uppercase tracking-widest text-red-500/90 hover:text-red-400 transition-colors"
              >
                Log Out
              </button>
            </div>
          </>
        ) : (
          <>
            <Link 
              href="/login" 
              className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
            >
              Log In
            </Link>
            <Link 
              href="/register" 
              className="px-5 py-2.5 bg-emerald-500 text-[#050505] text-[11px] font-bold uppercase tracking-widest rounded-sm hover:bg-emerald-400 transition-all shadow-[0_4px_14px_rgba(16,185,129,0.2)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.3)] hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}