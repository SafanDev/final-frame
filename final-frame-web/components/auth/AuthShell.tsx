import type { ReactNode } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

function ReviewCard() {
  return (
    <div className="ff-auth-preview" aria-hidden="true">
      <div className="ff-auth-preview-head">
        <span><i /> Brand launch</span>
        <b>Review</b>
      </div>
      <div className="ff-auth-preview-body">
        <div className="ff-auth-artboard">
          <small>FIELD NOTES / 07</small>
          <strong>Ideas need a clear finish.</strong>
          <span className="ff-auth-pin pin-a">1</span>
          <span className="ff-auth-pin pin-b">2</span>
        </div>
        <div className="ff-auth-comment">
          <span>01</span>
          <p><strong>Looks right.</strong> Make the last line shorter.</p>
        </div>
      </div>
      <div className="ff-auth-preview-foot">
        <span>Version 3</span>
        <span>2 comments</span>
        <span>Ready for decision</span>
      </div>
    </div>
  );
}

export default function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="ff-auth-page">
      <div className="ff-auth-layout">
        <aside className="ff-auth-story" aria-label="About FinalFrame">
          <Link href="/" className="ff-auth-brand" aria-label="FinalFrame home">
            <BrandMark className="h-9 w-9 text-emerald-300" />
            <span>FinalFrame</span>
          </Link>

          <div className="my-auto py-12">
            <p className="ff-hero-tag"><span /> One focused review space</p>
            <h2>Good work deserves a clear answer.</h2>
            <p>Share the file. Point to the change. Keep the final decision.</p>
            <ReviewCard />
          </div>

          <div className="ff-auth-trust">
            <span>Private files</span>
            <span>One-time invites</span>
            <span>Clear history</span>
          </div>
        </aside>

        <div className="ff-auth-form-wrap">
          <section className="ff-auth-card" aria-labelledby="auth-title">
            <Link href="/" className="ff-auth-mobile-brand" aria-label="FinalFrame home">
              <BrandMark className="h-8 w-8 text-emerald-300" />
              <span>FinalFrame</span>
            </Link>
            <div className="mb-8">
              <p className="ff-eyebrow">Secure access</p>
              <h1 id="auth-title">{title}</h1>
              <p>{description}</p>
            </div>
            {children}
            <div className="ff-auth-footer">{footer}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
