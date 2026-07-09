"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Register() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      router.push("/login");
    } catch (err) {
      setError("Server connection failed.");
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md p-8 bg-[#0a0a0a] border border-zinc-800 rounded-sm">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Initialize Account</h2>
        <p className="text-zinc-500 font-medium mb-8">Join the Canvas-Sync network.</p>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-400 text-sm font-bold rounded-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Full Name</label>
            <input 
              type="text" required
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white focus:border-emerald-500 focus:outline-none rounded-sm transition-colors"
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Email Address</label>
            <input 
              type="email" required
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white focus:border-emerald-500 focus:outline-none rounded-sm transition-colors"
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Password</label>
            <input 
              type="password" required minLength={6}
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white focus:border-emerald-500 focus:outline-none rounded-sm transition-colors"
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>
          <button type="submit" className="w-full py-4 mt-4 bg-emerald-500 text-[#050505] font-bold tracking-wide rounded-sm hover:bg-emerald-400 transition-colors">
            CREATE ACCOUNT
          </button>
        </form>

        <div className="mt-6 text-center text-sm font-medium text-zinc-500">
          Already have clearance? <Link href="/login" className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">Log in</Link>
        </div>
      </div>
    </div>
  );
}