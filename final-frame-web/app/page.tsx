import type { Metadata } from "next";
import StructuredData from "@/components/seo/StructuredData";
import LinkButton from "@/components/ui/LinkButton";
import { clientEnv } from "@/lib/env/client";

const title = "Design review without the mess";
const description = "Share work, collect clear feedback, manage versions and record final approval in one focused workspace.";
const brandedTitle = `${clientEnv.NEXT_PUBLIC_SITE_NAME}: ${title}`;

export const metadata: Metadata = {
  title: { absolute: brandedTitle },
  description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: { title: brandedTitle, description, url: "/", type: "website" },
  twitter: { card: "summary_large_image", title: brandedTitle, description },
};

function ReviewPreview() {
  return (
    <div className="ff-product-preview" aria-label="FinalFrame review workspace preview">
      <div className="ff-product-toolbar">
        <div className="flex items-center gap-2">
          <span className="ff-live-dot" />
          <span className="text-xs font-bold text-zinc-200">Campaign launch</span>
        </div>
        <span className="ff-status-chip">In review</span>
      </div>

      <div className="ff-product-grid">
        <aside className="ff-preview-rail" aria-hidden="true">
          {["Hero", "Mobile", "Story"].map((label, index) => (
            <div key={label} className={`ff-preview-thumb ${index === 0 ? "is-active" : ""}`}>
              <span className="ff-preview-thumb-art" />
              <span>{label}</span>
            </div>
          ))}
        </aside>

        <div className="ff-preview-stage">
          <div className="ff-preview-sheet">
            <span className="ff-preview-kicker">NORTH / 24</span>
            <h2>Make the next frame matter.</h2>
            <div className="ff-preview-shapes" aria-hidden="true">
              <span />
              <span />
            </div>
            <span className="ff-preview-pin pin-one">1</span>
            <span className="ff-preview-pin pin-two">2</span>
          </div>
        </div>

        <aside className="ff-preview-notes" aria-hidden="true">
          <p className="ff-preview-label">Live feedback</p>
          <div className="ff-note-card is-primary">
            <span>01</span>
            <strong>Shorten the headline</strong>
            <p>Keep the idea. Make it faster to read.</p>
          </div>
          <div className="ff-note-card">
            <span>02</span>
            <strong>Direction approved</strong>
            <p>This layout is ready for the next version.</p>
          </div>
        </aside>
      </div>

      <div className="ff-product-footer" aria-hidden="true">
        <span>3 files</span>
        <span>2 people here</span>
        <span>Version 4</span>
      </div>
    </div>
  );
}

const steps = [
  ["01", "Share", "Add the work and invite the right client."],
  ["02", "Review", "Pin feedback to the exact place it belongs."],
  ["03", "Finish", "Track versions and record the final decision."],
] as const;

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: clientEnv.NEXT_PUBLIC_SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: clientEnv.NEXT_PUBLIC_SITE_URL,
    description,
    featureList: ["Visual feedback", "Asset versioning", "Voice notes", "Client approval", "Realtime collaboration"],
  } as const;

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="ff-home-shell">
        <section className="ff-container grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 lg:pb-28 lg:pt-24">
          <div className="relative z-10">
            <div className="ff-hero-tag"><span /> Creative review, made clear</div>
            <h1 className="ff-home-title mt-6">
              Show the work.
              <span>Get the answer.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
              Files, feedback, versions and approval in one calm workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/register" variant="primary" size="lg">Start a review</LinkButton>
              <LinkButton href="/login" variant="secondary" size="lg">Sign in</LinkButton>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3 border-t border-white/10 pt-5 text-xs font-semibold text-zinc-500">
              <span>Precise feedback</span>
              <span>Private files</span>
              <span>Clear approval</span>
            </div>
          </div>
          <ReviewPreview />
        </section>

        <section className="ff-container pb-24 lg:pb-32" aria-labelledby="flow-title">
          <div className="ff-section-heading">
            <p>One simple flow</p>
            <h2 id="flow-title">From first share to final yes.</h2>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {steps.map(([number, heading, copy]) => (
              <article key={number} className="ff-step-card">
                <span>{number}</span>
                <h3>{heading}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ff-container pb-20 lg:pb-28">
          <div className="ff-final-cta">
            <div>
              <p className="ff-eyebrow">Ready when the work is</p>
              <h2>Keep the review moving.</h2>
            </div>
            <LinkButton href="/register" variant="primary" size="lg">Create account</LinkButton>
          </div>
        </section>
      </div>
    </>
  );
}
