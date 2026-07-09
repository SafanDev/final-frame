"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await signIn("credentials", {
      redirect: false,
      email: formData.email,
      password: formData.password,
    });

    if (res?.error) {
      setError("Invalid email or password");
    } else {
      router.push("/");
      router.refresh(); 
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md p-8 bg-[#0a0a0a] border border-zinc-800 rounded-sm">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Welcome Back</h2>
        <p className="text-zinc-500 font-medium mb-8">Access the Canvas-Sync engine.</p>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-400 text-sm font-bold rounded-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
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
              type="password" required
              className="w-full px-4 py-3 border border-zinc-800 bg-[#050505] text-white focus:border-emerald-500 focus:outline-none rounded-sm transition-colors"
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>
          <button type="submit" className="w-full py-4 mt-4 bg-white text-[#050505] font-bold tracking-wide rounded-sm hover:bg-zinc-200 transition-colors">
            SECURE LOGIN
          </button>
        </form>

        <div className="mt-6 text-center text-sm font-medium text-zinc-500">
          Require clearance? <Link href="/register" className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">Create account</Link>
        </div>
      </div>
    </div>
  );
}