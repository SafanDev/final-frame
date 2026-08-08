"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { signOutCurrentUser } from "@/app/actions/auth";
import AccountNavigation from "@/components/navigation/AccountNavigation";
import BrandLink from "@/components/navigation/BrandLink";
import GuestNavigation from "@/components/navigation/GuestNavigation";
import MenuIcon from "@/components/navigation/MenuIcon";
import NavItem from "@/components/navigation/NavItem";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { isProductRoute } from "@/lib/utils/productRoutes";

interface NavbarProps {
  currentUser: {
    name?: string | null;
  } | null;
}

export default function Navbar({ currentUser }: NavbarProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const productRoute = isProductRoute(pathname);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
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
    setSignOutError(false);

    try {
      await signOutCurrentUser();
      window.location.assign("/");
    } catch {
      setIsSigningOut(false);
      setSignOutError(true);
    }
  }

  return (
    <header className={cn("ff-site-header ff-safe-top", productRoute && "is-product")}>
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
          {!productRoute ? (
            <NavItem href="/" active={pathname === "/"}>
              Home
            </NavItem>
          ) : null}

          {currentUser ? (
            <>
              <AccountNavigation
                pathname={pathname}
                displayName={currentUser.name || "FinalFrame user"}
                isSigningOut={isSigningOut}
                onSignOut={() => void handleSignOut()}
              />

              {signOutError ? (
                <span className="ff-nav-loading" role="alert">
                  Sign out failed. Try again.
                </span>
              ) : null}
            </>
          ) : (
            <GuestNavigation pathname={pathname} />
          )}
        </div>
      </nav>
    </header>
  );
}