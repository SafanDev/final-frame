"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { confirmPasswordReset } from "@/lib/api/auth";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { useFragmentSecurityToken } from "@/hooks/useFragmentSecurityToken";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

export default function ResetPasswordClient() {
  const token = useFragmentSecurityToken();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = useMemo(() => {
    const categories = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((rule) => rule.test(password)).length;
    return password.length >= 12 && byteLength(password) <= 72 && categories >= 3 && password === confirmation;
  }, [confirmation, password]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !valid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      setMessage(await confirmPasswordReset(token, password));
      setPassword("");
      setConfirmation("");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "The password could not be changed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (token === undefined) return <p className="text-sm text-zinc-400" role="status">Preparing the secure reset form…</p>;
  if (!token) {
    return (
      <div className="space-y-4">
        <InlineAlert tone="error" title="Reset link unavailable">
          This reset link is missing, invalid, or expired.
        </InlineAlert>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 font-bold text-zinc-100 transition hover:border-emerald-300/30 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }
  if (message) {
    return (
      <div className="space-y-5">
        <InlineAlert tone="success" title="Password changed">{message}</InlineAlert>
        <Link href="/login" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-300 px-5 font-black text-zinc-950">Sign in</Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      {error ? <InlineAlert tone="error" title="Reset failed">{error}</InlineAlert> : null}
      <FieldFrame label="New password" htmlFor="reset-password" hint="Use 12 or more characters and at least three character types.">
        <input id="reset-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className={fieldControlClass} />
      </FieldFrame>
      <FieldFrame label="Confirm new password" htmlFor="reset-confirm" error={confirmation && password !== confirmation ? "Passwords do not match." : undefined}>
        <input id="reset-confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={fieldControlClass} />
      </FieldFrame>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting} disabled={!valid}>Change password</Button>
    </form>
  );
}
