import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  variant: "login" | "register" | "simple";
}

export default function AuthShell({ title, description, children, footer, variant }: AuthShellProps) {
  return (
    <div className={cn("ff-auth-page", `is-${variant}`)}>
      <div className="ff-auth-backdrop" aria-hidden="true">
        <span className="ff-auth-line ff-auth-line-one" />
        <span className="ff-auth-line ff-auth-line-two" />
        <span className="ff-auth-detail ff-auth-detail-one" />
        <span className="ff-auth-detail ff-auth-detail-two" />
      </div>

      <div className="ff-container ff-auth-layout">
        <section className="ff-auth-card" aria-labelledby="auth-title">
          <div className="ff-auth-heading">
            <h1 id="auth-title">{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          {children}
          <div className="ff-auth-footer">{footer}</div>
        </section>
      </div>
    </div>
  );
}
