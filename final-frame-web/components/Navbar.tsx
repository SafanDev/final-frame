"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import BrandMark from "@/components/BrandMark";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import { cn } from "@/lib/utils/cn";

const baseLinkClass =
  "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300";

function navigationClass(active: boolean): string {
  return cn(
    baseLinkClass,
    active
      ? "bg-white text-zinc-950 shadow-sm"
      : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setIsMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMenuOpen]);

  if (pathname.startsWith("/project/")) return null;

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut({ callbackUrl: "/" });
    } catch {
      setIsSigningOut(false);
      toast.error("FinalFrame could not sign you out. Refresh the page and try again.");
    }
  }

  const isDashboard = pathname === "/app";
  const isProduct = pathname === "/";
  const isAccount = pathname === "/account";
  const isNotifications = pathname === "/notifications";

  return (
    <header className="ff-safe-top sticky top-0 z-50 border-b border-white/[0.07] bg-[#08090b]/82 backdrop-blur-xl">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-xl text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          aria-label="FinalFrame home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] transition group-hover:rotate-3 group-hover:border-emerald-300/35"><BrandMark className="h-5 w-5 text-emerald-300" /></span>
          <span className="text-base font-black tracking-[-0.04em]">FinalFrame</span>
        </Link>

        <Button
          ref={triggerRef}
          variant="secondary"
          size="icon"
          className="md:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="primary-menu"
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <MenuIcon open={isMenuOpen} />
        </Button>

        <div
          ref={menuRef}
          id="primary-menu"
          className={cn(
            "absolute inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] flex-col gap-1 rounded-2xl border border-white/12 bg-[#111318]/98 p-3 shadow-[0_20px_55px_rgba(0,0,0,0.55)] md:static md:flex md:flex-row md:items-center md:gap-1 md:rounded-full md:border md:border-white/[0.08] md:bg-white/[0.025] md:p-1 md:shadow-none",
            isMenuOpen ? "flex" : "hidden md:flex",
          )}
        >
          <Link href="/" aria-current={isProduct ? "page" : undefined} className={navigationClass(isProduct)}>
            Home
          </Link>

          {status === "loading" ? (
            <span className="min-h-11 px-3.5 py-3 text-sm text-zinc-500" role="status">
              Checking session…
            </span>
          ) : session?.user ? (
            <>
              <Link href="/app" aria-current={isDashboard ? "page" : undefined} className={navigationClass(isDashboard)}>
                Projects
              </Link>
              <Link href="/notifications" aria-current={isNotifications ? "page" : undefined} className={navigationClass(isNotifications)}>
                Inbox
              </Link>
              <Link href="/account" aria-current={isAccount ? "page" : undefined} className={navigationClass(isAccount)}>
                Account
              </Link>
              <div className="my-1 h-px bg-white/10 md:mx-1 md:my-0 md:h-6 md:w-px" aria-hidden="true" />
              <div className="rounded-full border border-white/10 bg-black/20 px-3.5 py-2 md:max-w-44">
                <p className="truncate text-xs font-black text-white">{session.user.name || "FinalFrame user"}</p>
                <p className="truncate text-[0.66rem] font-bold uppercase tracking-[0.12em] text-zinc-500">Signed in</p>
              </div>
              <Button
                variant="ghost"
                onClick={() => void handleSignOut()}
                loading={isSigningOut}
                loadingLabel="Signing out…"
                className="justify-start md:justify-center"
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" className={navigationClass(pathname === "/login")}>
                Sign in
              </Link>
              <LinkButton href="/register" variant="primary" className="mt-1 md:mt-0">
                Create account
              </LinkButton>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
