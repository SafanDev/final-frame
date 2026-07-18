"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function Register() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed. Please verify your details.");
        setIsLoading(false);
        return;
      }
      
      // Success! Send them to login
      router.push("/login");
    } catch (err) {
      console.error(err);
      setError("Server connection failed. Ensure backend engine is running.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-100px)] py-12 px-4 w-full">
      <div className="w-full max-w-[420px] p-8 md:p-10 bg-[#0a0a0a] border border-zinc-800/80 rounded-sm shadow-2xl relative overflow-hidden animate-fade-in-up">
        
        {/* Premium Top Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-emerald-400"></div>
        
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
            <h1 className="text-2xl font-bold tracking-tight text-white">FinalFrame</h1>
          </div>
          <h2 className="text-xl font-semibold text-white tracking-tight mb-2">Create Account</h2>
          <p className="text-zinc-500 text-sm font-medium">Join the design approval network.</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold tracking-wide rounded-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Full Name</label>
            <input 
              type="text" 
              required
              disabled={isLoading}
              
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white text-sm focus:border-emerald-500 focus:outline-none rounded-sm transition-colors shadow-inner disabled:opacity-50"
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
            <input 
              type="email" 
              required
              disabled={isLoading}
              
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white text-sm focus:border-emerald-500 focus:outline-none rounded-sm transition-colors shadow-inner disabled:opacity-50"
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Password</label>
            <input 
              type="password" 
              required 
              minLength={6}
              disabled={isLoading}
              
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white text-sm focus:border-emerald-500 focus:outline-none rounded-sm transition-colors shadow-inner disabled:opacity-50"
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-3.5 mt-2 bg-emerald-500 text-[#050505] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <><div className="w-4 h-4 border-2 border-[#050505] border-t-transparent rounded-full animate-spin"></div> Authorizing...</>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-xs font-medium text-zinc-500 pt-6 border-t border-zinc-800/50">
          Already have account? <Link href="/login" className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors uppercase tracking-wider ml-1">Log in</Link>
        </div>
      </div>
    </div>
  );
}