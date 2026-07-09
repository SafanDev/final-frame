"use client";

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // --- THE ENTERPRISE FIX ---
  // If the user is inside the Project Workspace, completely unmount the global Navbar!
  if (pathname?.startsWith('/project/')) {
    return null;
  }

  return (
    <nav className="w-full bg-[#050505]/95 border-b border-zinc-800 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-emerald-500 flex items-center justify-center rounded-sm">
          <div className="h-3 w-3 bg-[#050505]"></div>
        </div>
        <span className="text-xl font-bold text-white tracking-tight">
          Pin<span className="text-emerald-500">Sight</span>
        </span>
      </div>
      
      <div className="flex items-center gap-8">
        {session ? (
          <>
            <Link href="/" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            
            <div className="flex items-center gap-4 border-l border-zinc-800 pl-6">
              <div className="h-9 w-9 bg-[#0a0a0a] border border-emerald-500 text-emerald-500 flex items-center justify-center rounded-full font-bold text-sm">
                {session.user?.name?.[0]?.toUpperCase() || "U"}
              </div>
              
              <button 
                onClick={() => signOut()} 
                className="text-sm font-semibold text-red-500 hover:text-red-400 transition-colors"
              >
                Log Out
              </button>
            </div>
          </>
        ) : (
          <>
            <Link href="/login" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">
              Log In
            </Link>
            <Link href="/register" className="px-4 py-2 bg-emerald-500 text-[#050505] text-sm font-bold rounded-sm hover:bg-emerald-400 transition-colors">
              Get Started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}