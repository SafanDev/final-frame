"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/project/")) return null;
  return (
    <footer className="relative z-10 border-t border-white/[0.07] bg-[#08090b]">
      <div className="ff-container flex flex-col gap-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <p><span className="font-black text-zinc-200">FinalFrame</span> · Clear feedback. Clear decisions.</p>
        <nav aria-label="Trust and support" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/privacy" className="transition hover:text-white">Privacy</Link>
          <Link href="/terms" className="transition hover:text-white">Terms</Link>
          <Link href="/security" className="transition hover:text-white">Security</Link>
          <Link href="/support" className="transition hover:text-white">Support</Link>
        </nav>
      </div>
    </footer>
  );
}
