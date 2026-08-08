"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";
import LinkButton from "@/components/ui/LinkButton";
import { reportClientError } from "@/lib/observability/client";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { source: "react-boundary", digest: error.digest });
  }, [error]);

  return (
    <main className="ff-project-error-page">
      <section className="ff-project-error-card" aria-labelledby="project-error-title">
        <span className="ff-project-error-mark" aria-hidden="true">!</span>
        <h1 id="project-error-title">Workspace didn’t open</h1>
        <p>Try once more or return to your projects.</p>
        {error.digest ? <code>Reference: {error.digest}</code> : null}
        <div>
          <Button variant="primary" onClick={reset}>Try again</Button>
          <LinkButton href="/app" variant="secondary">Back to projects</LinkButton>
        </div>
      </section>
    </main>
  );
}
