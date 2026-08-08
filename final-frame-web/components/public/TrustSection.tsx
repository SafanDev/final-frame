import type { ReactNode } from "react";

interface TrustSectionProps {
  number: string;
  title: string;
  children: ReactNode;
}

export default function TrustSection({ number, title, children }: TrustSectionProps) {
  const headingId = `trust-section-${number.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <section className="ff-trust-section" aria-labelledby={headingId}>
      <span className="ff-trust-section-number" aria-hidden="true">
        {number}
      </span>
      <div className="ff-trust-section-body">
        <h2 id={headingId}>{title}</h2>
        <div className="ff-trust-section-copy">{children}</div>
      </div>
    </section>
  );
}
