"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { requestEmailVerification, verifyEmailAddress } from "@/lib/api/auth";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { useFragmentSecurityToken } from "@/hooks/useFragmentSecurityToken";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";

function VerificationRequest({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || working) return;
    setWorking(true);
    setError(null);
    try {
      setMessage(await requestEmailVerification(email.trim().toLowerCase()));
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "A new verification link could not be requested."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
      {message ? <InlineAlert tone="success" title="Request accepted">{message}</InlineAlert> : null}
      {error ? <InlineAlert tone="error" title="Request failed">{error}</InlineAlert> : null}
      <FieldFrame label="Email address" htmlFor="verification-email">
        <input
          id="verification-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={working || Boolean(message)}
          className={fieldControlClass}
        />
      </FieldFrame>
      <Button type="submit" variant="secondary" className="w-full" loading={working} disabled={!email.trim() || Boolean(message)}>
        Send a new verification link
      </Button>
    </form>
  );
}

export default function VerifyEmailClient({ sent, email }: { sent: boolean; email: string }) {
  const token = useFragmentSecurityToken();
  const started = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void verifyEmailAddress(token)
      .then(setMessage)
      .catch((caught) => setError(getUserFacingErrorMessage(normalizeApiError(caught), "The email address could not be verified.")));
  }, [token]);

  if (token === undefined) return <p className="text-sm text-zinc-400" role="status">Checking the verification link…</p>;
  if (message) {
    return (
      <div className="space-y-5">
        <InlineAlert tone="success" title="Email verified">{message}</InlineAlert>
        <Link href="/login" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-300 px-5 font-black text-zinc-950">Sign in</Link>
      </div>
    );
  }
  if (token && !error) return <p className="text-sm text-zinc-400" role="status">Verifying your email address…</p>;

  return (
    <div>
      {error ? (
        <InlineAlert tone="error" title="Verification failed">{error}</InlineAlert>
      ) : sent ? (
        <InlineAlert tone="info" title="Check your inbox">We sent a verification link{email ? ` to ${email}` : ""}. The link expires automatically.</InlineAlert>
      ) : (
        <InlineAlert tone="warning" title="Verification link required">Open the secure link from your verification email.</InlineAlert>
      )}
      <VerificationRequest initialEmail={email} />
    </div>
  );
}
