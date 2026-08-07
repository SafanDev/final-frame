"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/client";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import LinkButton from "@/components/ui/LinkButton";

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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#050607] px-5 py-8 text-white">
      <main className="mx-auto flex min-h-full max-w-2xl items-center justify-center">
        <EmptyState
          icon={<span aria-hidden="true">!</span>}
          title="The workspace stopped unexpectedly"
          description={
            <>
              <p>Retry once. If the problem continues, return to the dashboard and keep the support reference.</p>
              {error.digest ? (
                <code className="mt-4 inline-block max-w-full break-all rounded-lg border border-white/10 bg-black/25 px-3 py-2 font-mono text-xs text-zinc-400">
                  Support reference: {error.digest}
                </code>
              ) : null}
            </>
          }
          action={
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <LinkButton href="/app" variant="secondary">
                Return to dashboard
              </LinkButton>
              <Button variant="primary" onClick={reset}>
                Retry workspace
              </Button>
            </div>
          }
        />
      </main>
    </div>
  );
}
