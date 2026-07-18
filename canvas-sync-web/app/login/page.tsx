"use client";

// ============================================================================
// LOGIN PAGE
// ============================================================================
// Upgrades: Premium SVG Logo, Sonner Toasts, Ambient Glow, and WCAG accessibility.
// ============================================================================

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toast.error("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Authenticating...");

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: formData.email,
        password: formData.password,
      });

      if (res?.error) {
        toast.error("Invalid email or password.", { id: toastId });
      } else if (res?.ok) {
        toast.success("Access granted.", { id: toastId });
        router.push("/");
        router.refresh(); 
      }
    } catch (err) {
      toast.error("An unexpected error occurred.", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-100px)] py-12 px-4 w-full relative selection:bg-emerald-500/30">
      
      {/* Premium Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

      <div className="w-full max-w-[420px] p-8 md:p-10 bg-[#0a0a0a] border border-zinc-800/80 rounded-sm shadow-2xl relative overflow-hidden animate-fade-in-up z-10">
        
        {/* Premium Top Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-emerald-600 to-emerald-400"></div>
        
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.15)] rounded-md overflow-hidden">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" fill="#10B981"/>
                <path d="M9 10C9 8.89543 9.89543 8 11 8H21C22.1046 8 23 8.89543 23 10V13C23 14.1046 22.1046 15 21 15H11C9.89543 15 9 14.1046 9 13V10Z" fill="#050505"/>
                <path d="M9 19C9 17.8954 9.89543 17 11 17H17C18.1046 17 19 17.8954 19 19V22C19 23.1046 18.1046 24 17 24H11C9.89543 24 9 23.1046 9 22V19Z" fill="#050505"/>
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">FinalFrame</h1>
          </div>
          <h2 className="text-xl font-semibold text-white tracking-tight mb-2">Welcome Back</h2>
          <p className="text-zinc-500 text-sm font-medium">Access the collaboration engine.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
            <input 
              type="email" 
              required
              disabled={isLoading}
              placeholder="alex@studio.com"
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white text-sm focus:border-emerald-500 focus:outline-none rounded-sm transition-colors shadow-inner disabled:opacity-50"
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Password</label>
            <input 
              type="password" 
              required
              disabled={isLoading}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white text-sm focus:border-emerald-500 focus:outline-none rounded-sm transition-colors shadow-inner disabled:opacity-50"
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-3.5 mt-2 bg-white text-[#050505] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-zinc-200 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <><div className="w-4 h-4 border-2 border-[#050505] border-t-transparent rounded-full animate-spin"></div> Connecting...</>
            ) : (
              "Secure Login"
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-xs font-medium text-zinc-500 pt-6 border-t border-zinc-800/50">
          Require clearance? <Link href="/register" className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors uppercase tracking-wider ml-1">Create account</Link>
        </div>
      </div>
    </div>
  );
}