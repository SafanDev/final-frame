"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";
import { reportClientError } from "@/lib/observability/client";

export default function ErrorPage({
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
    <main className="ff-container ff-system-state" aria-labelledby="route-error-title">
      <div className="ff-system-state-copy">
        <p className="ff-system-state-code">Request interrupted</p>
        <h1 id="route-error-title">This page could not be loaded</h1>
        <p>Try the request again. If it keeps failing, keep the support reference below when contacting your deployment operator.</p>
        {error.digest ? <code className="ff-system-reference">{error.digest}</code> : null}
        <div className="ff-system-actions">
          <Button variant="primary" onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
