import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const trustLinks = [
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
] as const;

type TrustRoute = (typeof trustLinks)[number]["href"];

interface TrustPageShellProps {
  active: TrustRoute;
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  note?: ReactNode;
}

export default function TrustPageShell({
  active,
  eyebrow,
  title,
  description,
  children,
  note,
}: TrustPageShellProps) {
  return (
    <div className="ff-trust-page">
      <div className="ff-container ff-trust-layout">
        <aside className="ff-trust-rail">
          <div className="ff-trust-rail-inner">
            <p className="ff-trust-rail-label">FinalFrame</p>
            <nav className="ff-trust-nav" aria-label="Trust center">
              {trustLinks.map((link) => {
                const current = active === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={cn("ff-trust-nav-link", current && "is-active")}
                  >
                    <span>{link.label}</span>
                    <span aria-hidden="true">{current ? "•" : "↗"}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="ff-trust-main">
          <header className="ff-trust-header">
            <p className="ff-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <div className="ff-trust-intro">{description}</div>
          </header>

          <div className="ff-trust-sections">{children}</div>

          {note ? <div className="ff-trust-note">{note}</div> : null}
        </main>
      </div>
    </div>
  );
}
