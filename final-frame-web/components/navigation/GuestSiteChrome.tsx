/*
 * Guest navigation intentionally uses native anchors so the anonymous
 * landing route stays server-rendered without Next.js client-router hydration.
 */
/* eslint-disable @next/next/no-html-link-for-pages */
import BrandMark from "@/components/BrandMark";
import { getButtonClassName } from "@/components/ui/buttonStyles";

const trustLinks = [
  ["Security", "/security"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Support", "/support"],
] as const;

function GuestBrandLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="/"
      className={`ff-brand-link${compact ? " ff-brand-link-compact" : ""}`}
      aria-label="FinalFrame home"
    >
      <span className="ff-brand-mark" aria-hidden="true">
        <BrandMark className="h-5 w-5" />
      </span>
      <span>FinalFrame</span>
    </a>
  );
}

function GuestNavigationLinks() {
  return (
    <>
      <a href="/" className="ff-nav-link">Home</a>
      <a href="/login" className="ff-nav-link">Sign in</a>
      <a href="/register" className={getButtonClassName("primary", "sm", "ff-nav-primary")}>
        Create account
      </a>
    </>
  );
}

export function GuestSiteHeader() {
  return (
    <header className="ff-site-header ff-safe-top">
      <nav aria-label="Primary navigation" className="ff-container ff-site-nav">
        <GuestBrandLink />

        <div className="ff-guest-nav-desktop">
          <GuestNavigationLinks />
        </div>

        <details className="ff-guest-nav-details">
          <summary className="ff-guest-nav-summary" aria-label="Navigation menu">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </summary>

          <div className="ff-nav-menu ff-guest-nav-menu">
            <GuestNavigationLinks />
          </div>
        </details>
      </nav>
    </header>
  );
}

export function GuestSiteFooter() {
  return (
    <footer className="ff-site-footer">
      <div className="ff-container ff-footer-inner">
        <div className="ff-footer-brand">
          <GuestBrandLink compact />
          <p>Focused review. Accountable approval.</p>
        </div>
        <nav aria-label="Trust and support" className="ff-footer-links">
          {trustLinks.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
