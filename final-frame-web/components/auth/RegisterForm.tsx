"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { registerAccount } from "@/lib/api/auth";
import {
  getUserFacingErrorMessage,
  normalizeApiError,
  type ApiError,
} from "@/lib/api/errors";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";
import { cn } from "@/lib/utils/cn";

interface RegisterFormProps {
  callbackUrl: string;
  initialEmail?: string;
}

function passwordCategoryCount(password: string): number {
  return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((rule) => rule.test(password)).length;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function fieldMessage(error: ApiError | null, field: string): string | null {
  return error?.fields.find((item) => item.path === field)?.message ?? null;
}

function Requirement({ met, children }: { met: boolean; children: string }) {
  return (
    <li className={cn("flex items-start gap-2", met ? "text-emerald-300" : "text-zinc-400")}>
      <span aria-hidden="true" className="mt-px">{met ? "✓" : "○"}</span>
      <span>{children}</span>
    </li>
  );
}

export default function RegisterForm({ callbackUrl, initialEmail = "" }: RegisterFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const passwordChecks = useMemo(
    () => ({
      length: password.length >= 12,
      byteLength: utf8Length(password) <= 72,
      categories: passwordCategoryCount(password) >= 3,
      match: password.length > 0 && password === confirmPassword,
    }),
    [confirmPassword, password],
  );

  const nameError = fieldMessage(submitError, "name");
  const emailError = fieldMessage(submitError, "email");
  const passwordError = fieldMessage(submitError, "password");
  const formIsValid =
    name.trim().length >= 2 &&
    email.trim().length > 0 &&
    passwordChecks.length &&
    passwordChecks.byteLength &&
    passwordChecks.categories &&
    passwordChecks.match;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    if (!formIsValid || isSubmitting) return;

    setIsSubmitting(true);
    const toastId = toast.loading("Creating your account…");

    try {
      const result = await registerAccount({ name: name.trim(), email: email.trim().toLowerCase(), password });
      toast.success(result.message, { id: toastId });
      const parameters = new URLSearchParams({
        registered: "1",
        email: email.trim().toLowerCase(),
        callbackUrl,
      });
      if (result.nextStep === "VERIFY_EMAIL") {
        router.replace(`/verify-email?sent=1&email=${encodeURIComponent(email.trim().toLowerCase())}`);
      } else {
        router.replace(`/login?${parameters.toString()}`);
      }
    } catch (error) {
      const normalized = normalizeApiError(error);
      setSubmitError(normalized);
      toast.error("Your account could not be created.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-zinc-400">
        New accounts start with Client access.
      </div>

      {submitError ? (
        <InlineAlert tone="error" title="Account could not be created" requestId={submitError.requestId}>
          {getUserFacingErrorMessage(submitError)}
        </InlineAlert>
      ) : null}

      <FieldFrame label="Full name" htmlFor="register-name" error={nameError}>
        <input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}

          disabled={isSubmitting}
          value={name}
          aria-invalid={Boolean(nameError) || undefined}
          onChange={(event) => setName(event.target.value)}
          className={fieldControlClass}
        />
      </FieldFrame>

      <FieldFrame label="Email address" htmlFor="register-email" error={emailError}>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          disabled={isSubmitting}
          value={email}
          aria-invalid={Boolean(emailError) || undefined}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldControlClass}
        />
      </FieldFrame>

      <FieldFrame label="Password" htmlFor="register-password" error={passwordError}>
        <div className="relative">
          <input
            id="register-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            aria-describedby="password-requirements"
            aria-invalid={Boolean(passwordError) || undefined}
            disabled={isSubmitting}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={cn(fieldControlClass, "pr-24")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={isSubmitting}
            aria-pressed={showPassword}
            className="absolute inset-y-1 right-1 min-w-20 rounded-lg px-3 text-xs font-bold text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <ul id="password-requirements" className="mt-3 grid gap-1.5 text-xs leading-5 sm:grid-cols-2">
          <Requirement met={passwordChecks.length}>At least 12 characters</Requirement>
          <Requirement met={passwordChecks.byteLength}>Within the secure length limit</Requirement>
          <Requirement met={passwordChecks.categories}>Three character categories</Requirement>
          <Requirement met={passwordChecks.match}>Passwords match</Requirement>
        </ul>
      </FieldFrame>

      <FieldFrame label="Confirm password" htmlFor="register-confirm-password" error={confirmPassword.length > 0 && !passwordChecks.match ? "Passwords do not match." : undefined}>
        <input
          id="register-confirm-password"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          disabled={isSubmitting}
          value={confirmPassword}
          aria-invalid={confirmPassword.length > 0 && !passwordChecks.match || undefined}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className={fieldControlClass}
        />
      </FieldFrame>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={isSubmitting}
        loadingLabel="Creating account…"
        disabled={!formIsValid}
        className="w-full"
      >
        Create account
      </Button>
    </form>
  );
}
