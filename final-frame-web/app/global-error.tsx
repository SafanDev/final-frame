"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      source: "global-boundary",
      digest: error.digest,
      fatal: true,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#050607] px-5 py-10 font-sans text-zinc-100 antialiased">
        <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center justify-center">
          <section
            className="w-full rounded-3xl border border-white/10 bg-[rgba(12,13,15,0.94)] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] sm:p-10"
            aria-labelledby="global-error-title"
          >
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-500/10 text-2xl font-black text-rose-200"
              aria-hidden="true"
            >
              !
            </div>
            <p className="mt-5 text-sm font-bold text-rose-200">Application error</p>
            <h1
              id="global-error-title"
              className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl"
            >
              FinalFrame could not start correctly
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
              Reload the application once. If the problem continues, verify the frontend environment configuration and confirm that the API is available.
            </p>
            {error.digest ? (
              <code className="mt-5 inline-block max-w-full break-all rounded-lg border border-white/10 bg-black/25 px-3 py-2 font-mono text-xs text-zinc-400">
                Support reference: {error.digest}
              </code>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl border border-transparent bg-emerald-400 px-5 text-base font-bold text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050607]"
            >
              Reload application
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
