"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/client";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

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
    <section className="ff-container flex min-h-[65vh] items-center justify-center py-12" aria-labelledby="route-error-title">
      <div className="w-full max-w-2xl">
        <EmptyState
          icon={<span aria-hidden="true">!</span>}
          title="This page could not be loaded"
          description={
            <>
              <p>Retry the request. If the problem continues, keep the reference below when contacting support.</p>
              {error.digest ? (
                <code className="mt-4 inline-block max-w-full break-all rounded-lg border border-white/10 bg-black/25 px-3 py-2 font-mono text-xs text-zinc-400">
                  Support reference: {error.digest}
                </code>
              ) : null}
            </>
          }
          action={
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
          }
        />
      </div>
    </section>
  );
}
