"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import AccountNavigation from "@/components/navigation/AccountNavigation";
import BrandLink from "@/components/navigation/BrandLink";
import GuestNavigation from "@/components/navigation/GuestNavigation";
import MenuIcon from "@/components/navigation/MenuIcon";
import NavItem from "@/components/navigation/NavItem";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

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

  return (
    <header className="ff-site-header ff-safe-top">
      <nav aria-label="Primary navigation" className="ff-container ff-site-nav">
        <BrandLink />

        <Button
          ref={triggerRef}
          variant="secondary"
          size="icon"
          className="ff-nav-trigger md:hidden"
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
          className={cn("ff-nav-menu", isMenuOpen ? "is-open" : "")}
        >
          <NavItem href="/" active={pathname === "/"}>
            Home
          </NavItem>

          {status === "loading" ? (
            <span className="ff-nav-loading" role="status">
              Checking session…
            </span>
          ) : session?.user ? (
            <AccountNavigation
              pathname={pathname}
              displayName={session.user.name || "FinalFrame user"}
              isSigningOut={isSigningOut}
              onSignOut={() => void handleSignOut()}
            />
          ) : (
            <GuestNavigation pathname={pathname} />
          )}
        </div>
      </nav>
    </header>
  );
}
