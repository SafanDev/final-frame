"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import LinkButton from "@/components/ui/LinkButton";
import { joinProjectInvite } from "@/lib/api/projects";
import {
  getUserFacingErrorMessage,
  normalizeApiError,
  type ApiError,
} from "@/lib/api/errors";
import { loginHref } from "@/lib/auth/redirects";
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
  const [message, setMessage] = useState(tokenIsValid ? "Checking your invitation…" : "This invitation link is not valid.");
  const [error, setError] = useState<ApiError | null>(null);

  const processInvitation = useCallback(async () => {
    if (!tokenIsValid || startedRef.current) return;
    startedRef.current = true;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState("joining");
    setMessage("Opening project access…");
    setError(null);

    try {
      const result = await joinProjectInvite(token, controller.signal);
      clearStoredInvitationToken();
      setState("success");
      setMessage(result.message);
      redirectTimerRef.current = window.setTimeout(() => {
        router.replace(`/project/${result.projectId}`);
        router.refresh();
      }, 500);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (normalized.kind === "aborted") return;
      if (normalized.status === 404 || normalized.status === 410) clearStoredInvitationToken();
      setError(normalized);
      setState("error");
      setMessage(getUserFacingErrorMessage(normalized, "The invitation could not be opened."));
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

  const title = state === "success"
    ? "You’re in"
    : state === "error"
      ? "Invitation unavailable"
      : "Project invitation";

  return (
    <main className="ff-invite-page">
      <section className="ff-invite-card" aria-labelledby="invite-title">
        <div className="ff-invite-status" aria-hidden="true">
          <span className={state === "error" ? "is-error" : state === "success" ? "is-success" : "is-working"} />
          <span>{state === "success" ? "Access confirmed" : state === "error" ? "Could not join" : "Private invite"}</span>
        </div>
        <h1 id="invite-title">{title}</h1>

        {state === "error" ? (
          <>
            <InlineAlert tone="error" title="Could not open invitation" requestId={error?.requestId} className="ff-invite-alert">
              {message}
            </InlineAlert>
            <div className="ff-invite-actions">
              {tokenIsValid && error?.retryable ? <Button variant="primary" onClick={retry}>Try again</Button> : null}
              <LinkButton href="/app" variant="secondary">Back to projects</LinkButton>
            </div>
          </>
        ) : status === "unauthenticated" ? (
          <>
            <p className="ff-invite-copy">Sign in to accept this project invitation.</p>
            <div className="ff-invite-actions">
              <LinkButton href={loginHref("/invite")} variant="primary">Sign in</LinkButton>
              <LinkButton href="/app" variant="secondary">Back to projects</LinkButton>
            </div>
          </>
        ) : state === "waiting" || state === "joining" ? (
          <div className="ff-invite-progress" role="status" aria-live="polite">
            <span className="ff-invite-spinner" aria-hidden="true" />
            <p>{status === "loading" ? "Checking your session…" : message}</p>
          </div>
        ) : (
          <div className="ff-invite-success" role="status" aria-live="polite">
            <p>{message}</p>
            <span>Opening project…</span>
          </div>
        )}
      </section>
    </main>
  );
}
