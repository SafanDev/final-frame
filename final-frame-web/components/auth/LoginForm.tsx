"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { getAuthCapabilities } from "@/lib/api/auth";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";
import { cn } from "@/lib/utils/cn";

interface LoginFormProps {
  callbackUrl: string;
  initialEmail?: string;
  registered?: boolean;
}

export default function LoginForm({
  callbackUrl,
  initialEmail = "",
  registered = false,
}: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailDeliveryAvailable, setEmailDeliveryAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getAuthCapabilities(controller.signal)
      .then((capabilities) => setEmailDeliveryAvailable(capabilities.emailDelivery))
      .catch(() => setEmailDeliveryAvailable(null));
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    setVerificationRequired(false);
    setIsSubmitting(true);
    const toastId = toast.loading("Signing you in…");

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        ...(mfaCode.trim() ? { mfaCode: mfaCode.trim() } : {}),
        redirect: false,
        callbackUrl,
      });

      if (!result?.ok || result.error) {
        const authError = result?.error ?? "";
        if (authError.includes("MFA_REQUIRED")) {
          setMfaRequired(true);
          setFormError(null);
          toast.dismiss(toastId);
          return;
        }
        if (authError.includes("EMAIL_NOT_VERIFIED")) {
          setVerificationRequired(true);
          setFormError("Verify your email before signing in.");
          toast.dismiss(toastId);
          return;
        }
        if (authError.includes("ACCOUNT_SUSPENDED")) {
          setFormError("This account is unavailable. Contact support if you think this is a mistake.");
          toast.dismiss(toastId);
          return;
        }
        const message = mfaRequired
          ? "The email, password or verification code is incorrect."
          : "The email address or password is incorrect. Check both fields and try again.";
        setFormError(message);
        toast.error("Sign in was not successful.", { id: toastId });
        return;
      }

      toast.success("Signed in securely.", { id: toastId });
      window.location.assign(callbackUrl);
    } catch (caught) {
      if (caught instanceof Error && caught.message.includes("MFA_REQUIRED")) {
        setMfaRequired(true);
        setFormError(null);
        toast.dismiss(toastId);
      } else if (caught instanceof Error && caught.message.includes("EMAIL_NOT_VERIFIED")) {
        setVerificationRequired(true);
        setFormError("Verify your email before signing in.");
        toast.dismiss(toastId);
      } else if (caught instanceof Error && caught.message.includes("ACCOUNT_SUSPENDED")) {
        setFormError("This account is unavailable. Contact support if you think this is a mistake.");
        toast.dismiss(toastId);
      } else {
        const message = "FinalFrame could not reach the authentication service. Check your connection and try again.";
        setFormError(message);
        toast.error("Authentication service unavailable.", { id: toastId });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {registered ? (
        <InlineAlert tone="success" title="Continue to sign in">
          Use your account details to continue to your requested destination.
        </InlineAlert>
      ) : null}

      {formError ? (
        <InlineAlert tone="error" title="Unable to sign in">
          <p>{formError}</p>
          {verificationRequired && emailDeliveryAvailable !== false ? (
            <Link href={`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`} className="mt-2 inline-flex font-bold text-rose-100 underline underline-offset-4">
              Request a new verification link
            </Link>
          ) : null}
        </InlineAlert>
      ) : null}

      <FieldFrame label="Email address" htmlFor="login-email">
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}

          disabled={isSubmitting}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldControlClass}
        />
      </FieldFrame>

      <FieldFrame label="Password" htmlFor="login-password">
        <div className="relative">
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}

            disabled={isSubmitting}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={cn(fieldControlClass, "pr-20")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={isSubmitting}
            aria-pressed={showPassword}
            className="absolute inset-y-1 right-1 min-w-16 rounded-lg px-3 text-xs font-bold text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </FieldFrame>

      {mfaRequired ? (
        <FieldFrame label="Authenticator or recovery code" htmlFor="login-mfa" hint="Use the six-digit code from your authenticator or one unused recovery code.">
          <input
            id="login-mfa"
            name="mfaCode"
            type="text"
            autoComplete="one-time-code"
            inputMode="numeric"
            required
            maxLength={32}
            autoFocus
            disabled={isSubmitting}
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            className={fieldControlClass}
          />
        </FieldFrame>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={isSubmitting}
        loadingLabel="Signing in…"
        disabled={!email.trim() || !password || (mfaRequired && !mfaCode.trim())}
        className="w-full"
      >
        Sign in securely
      </Button>

    </form>
  );
}
