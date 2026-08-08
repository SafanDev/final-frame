import Link from "next/link";
import BrandLink from "@/components/navigation/BrandLink";
import NavItem from "@/components/navigation/NavItem";
import LinkButton from "@/components/ui/LinkButton";

const trustLinks = [
  ["Security", "/security"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Support", "/support"],
] as const;

function GuestNavigationLinks() {
  return (
    <>
      <NavItem href="/">Home</NavItem>
      <NavItem href="/login">Sign in</NavItem>
      <LinkButton href="/register" variant="primary" size="sm" className="ff-nav-primary" prefetch={false}>
        Create account
      </LinkButton>
    </>
  );
}

export function GuestSiteHeader() {
  return (
    <header className="ff-site-header ff-safe-top">
      <nav aria-label="Primary navigation" className="ff-container ff-site-nav">
        <BrandLink />

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
          <BrandLink compact />
          <p>Focused review. Accountable approval.</p>
        </div>
        <nav aria-label="Trust and support" className="ff-footer-links">
          {trustLinks.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
