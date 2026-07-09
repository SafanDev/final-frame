"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

export default function InviteBouncerPage({ params }: { params: Promise<{ token: string }> }) {
  const unwrappedParams = use(params);
  const token = unwrappedParams.token;
  
  const { data: session, status } = useSession();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    // If they aren't logged in, they can't join! Force them to log in first.
    if (status === "unauthenticated") {
      router.push("/login"); 
    } 
    // If they are logged in, send their ID and the token to the backend bouncer
    else if (status === "authenticated" && session?.user) {
      processMagicLink();
    }
  }, [status, session]);

  const processMagicLink = async () => {
    // --- THE FIX: Tell TypeScript we promise the session exists ---
    if (!session?.user) return;

    try {
      const res = await fetch(`http://localhost:5000/api/invite/${token}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // TypeScript is now happy because of the check on line 28!
        body: JSON.stringify({ userId: (session.user as any).id }),
      });

      const data = await res.json();

      if (res.ok) {
        // Success! Redirect them straight into the project workspace
        router.push(`/project/${data.projectId}`);
      } else {
        setError(data.error || "Failed to join project. The link may be expired.");
      }
    } catch (err) {
      console.error(err);
      setError("Server error. Could not process invite.");
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh]">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500 text-red-500 rounded-full flex items-center justify-center text-3xl mb-6">!</div>
        <h2 className="text-2xl font-bold text-white mb-2">Invite Failed</h2>
        <p className="text-zinc-400 mb-6">{error}</p>
        <button onClick={() => router.push("/")} className="px-6 py-2 bg-zinc-800 text-white font-bold rounded-sm hover:bg-zinc-700 text-sm">
          Return to Dashboard
        </button>
      </div>
    );
  }

  // The cool loading screen while the backend verifies their token
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-12 h-12 border-4 border-zinc-800 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
      <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Verifying Magic Link...</h2>
      <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest animate-pulse">Securing your access</p>
    </div>
  );
}