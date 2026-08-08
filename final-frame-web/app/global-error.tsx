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
      <body className="min-h-screen bg-[#090a0c] px-5 py-10 font-sans text-[#f5f7fa] antialiased">
        <main className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl place-items-center">
          <section className="w-full max-w-xl" aria-labelledby="global-error-title">
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[#ef9aa4]">
              Application error
            </p>
            <h1
              id="global-error-title"
              className="mt-3 text-[clamp(2rem,6vw,3rem)] font-extrabold leading-none tracking-[-0.05em] text-white"
            >
              FinalFrame could not start correctly
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-[#b0b6c0]">
              Reload the application once. If the problem continues, confirm that the frontend configuration and API are available.
            </p>
            {error.digest ? (
              <code className="mt-4 block max-w-full break-all border-l-2 border-white/20 pl-3 font-mono text-xs text-[#9299a6]">
                {error.digest}
              </code>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#4fd1a1] px-4 text-sm font-bold text-[#071b14] transition hover:bg-[#67deb2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#67ffc4]"
            >
              Reload application
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
