"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getAuthCapabilities, requestPasswordReset } from "@/lib/api/auth";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailDeliveryAvailable, setEmailDeliveryAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getAuthCapabilities(controller.signal)
      .then((capabilities) => setEmailDeliveryAvailable(capabilities.emailDelivery))
      .catch(() => setEmailDeliveryAvailable(true));
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      setMessage(await requestPasswordReset(email.trim().toLowerCase()));
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "The reset request could not be completed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (emailDeliveryAvailable === false) {
    return (
      <InlineAlert tone="info" title="Reset email is not available">
        Sign in with your current password, then change it from Account settings.
      </InlineAlert>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      {message ? <InlineAlert tone="success" title="Check your inbox">{message}</InlineAlert> : null}
      {error ? <InlineAlert tone="error" title="Request failed">{error}</InlineAlert> : null}
      <FieldFrame label="Email address" htmlFor="recovery-email">
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}

          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting || Boolean(message) || emailDeliveryAvailable === null}
          className={fieldControlClass}
        />
      </FieldFrame>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting} disabled={!email.trim() || Boolean(message) || emailDeliveryAvailable === null}>
        Send reset link
      </Button>
    </form>
  );
}
