"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { joinProjectInvite } from "@/lib/api/projects";
import {
  getUserFacingErrorMessage,
  normalizeApiError,
  type ApiError,
} from "@/lib/api/errors";
import { loginHref } from "@/lib/auth/redirects";
import InlineAlert from "@/components/ui/InlineAlert";
import BrandMark from "@/components/BrandMark";
import { clearStoredInvitationToken } from "@/lib/invitations/token-storage";

interface InviteJoinClientProps {
  token: string;
  tokenIsValid: boolean;
}

type InviteState = "waiting" | "joining" | "success" | "error";

export default function InviteJoinClient({ token, tokenIsValid }: InviteJoinClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const requestRef = useRef<AbortController | null>(null);
  const redirectTimerRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const [state, setState] = useState<InviteState>(tokenIsValid ? "waiting" : "error");
  const [message, setMessage] = useState(
    tokenIsValid ? "Preparing your invitation…" : "This invitation address is not valid.",
  );
  const [error, setError] = useState<ApiError | null>(null);

  const processInvitation = useCallback(async () => {
    if (!tokenIsValid || startedRef.current) return;
    startedRef.current = true;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState("joining");
    setMessage("Confirming access to the project…");
    setError(null);

    try {
      const result = await joinProjectInvite(token, controller.signal);
      clearStoredInvitationToken();
      setState("success");
      setMessage(result.message);
      redirectTimerRef.current = window.setTimeout(() => {
        router.replace(`/project/${result.projectId}`);
        router.refresh();
      }, 650);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (normalized.kind === "aborted") return;
      if (normalized.status === 404 || normalized.status === 410) clearStoredInvitationToken();
      setError(normalized);
      setState("error");
      setMessage(getUserFacingErrorMessage(normalized, "The invitation could not be processed."));
    }
  }, [router, token, tokenIsValid]);

  useEffect(() => {
    if (status === "authenticated") void processInvitation();
    return () => {
      requestRef.current?.abort();
      if (redirectTimerRef.current !== null) window.clearTimeout(redirectTimerRef.current);
    };
  }, [processInvitation, status]);

  function retry() {
    startedRef.current = false;
    void processInvitation();
  }

  const callbackUrl = "/invite";

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <section className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a]/95 p-7 text-center shadow-[0_32px_100px_rgba(0,0,0,0.6)] sm:p-10" aria-labelledby="invite-title">
        <div className="absolute inset-x-0 top-0 h-px bg-emerald-300/70" aria-hidden="true" />
        <BrandMark className="mx-auto h-12 w-12 text-emerald-400" />

        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
          Secure project invitation
        </p>
        <h1 id="invite-title" className="mt-3 text-3xl font-black tracking-tight text-white">
          {state === "success"
            ? "Access confirmed"
            : state === "error"
              ? "Invitation unavailable"
              : "Joining the workspace"}
        </h1>

        {state === "waiting" || state === "joining" ? (
          <div className="mt-8" role="status" aria-live="polite">
            <div className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" aria-hidden="true" />
            <p className="mt-5 leading-7 text-zinc-300">
              {status === "loading" ? "Checking your secure session…" : message}
            </p>
          </div>
        ) : null}

        {state === "success" ? (
          <InlineAlert tone="success" title="Invitation accepted" className="mt-8 text-left">
            {message} Opening the project workspace now.
          </InlineAlert>
        ) : null}

        {state === "error" ? (
          <div className="mt-8 space-y-5 text-left">
            <InlineAlert tone="error" title="Access could not be confirmed" requestId={error?.requestId}>
              {message}
            </InlineAlert>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {tokenIsValid && error?.retryable ? (
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-400 px-5 font-bold text-[#04110d] transition hover:bg-emerald-300"
                >
                  Try again
                </button>
              ) : null}
              <Link
                href="/app"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 px-5 font-bold text-white transition hover:bg-white/5"
              >
                Return to projects
              </Link>
            </div>
          </div>
        ) : null}

        {status === "unauthenticated" ? (
          <InlineAlert tone="warning" title="Sign in required" className="mt-8 text-left">
            <p>You must sign in before accepting this invitation.</p>
            <Link href={loginHref(callbackUrl)} className="mt-3 inline-flex font-bold text-amber-100 underline underline-offset-4">
              Sign in and return here
            </Link>
          </InlineAlert>
        ) : null}

        <p className="mt-8 text-xs leading-5 text-zinc-500">
          Invitations expire automatically and cannot be used to access other projects.
        </p>
      </section>
    </div>
  );
}
