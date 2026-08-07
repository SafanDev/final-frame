"use client";

import { useEffect, useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  confirmAccountSecurityAction,
  downloadAccountExport,
  enableMfa,
  getAccountProfile,
  startMfaSetup,
  type AccountProfile,
  type MfaSetup,
} from "@/lib/api/account";
import { apiRoutes } from "@/lib/api/routes";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";
import AccountPreferences from "@/components/account/AccountPreferences";

const bytes = (value: string): string => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount < 1024) return `${amount} B`;
  if (amount < 1024 ** 2) return `${(amount / 1024).toFixed(1)} KB`;
  if (amount < 1024 ** 3) return `${(amount / 1024 ** 2).toFixed(1)} MB`;
  return `${(amount / 1024 ** 3).toFixed(2)} GB`;
};

function SecurityConfirmation({
  title,
  description,
  mfaEnabled,
  destructive = false,
  confirmationLabel,
  confirmationPhrase,
  idPrefix,
  onConfirm,
}: {
  title: string;
  description: string;
  mfaEnabled: boolean;
  destructive?: boolean;
  confirmationLabel: string;
  confirmationPhrase?: "DELETE";
  idPrefix: string;
  onConfirm: (input: { password: string; mfaCode?: string; confirmation?: "DELETE" }) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || (mfaEnabled && !mfaCode.trim()) || (confirmationPhrase && confirmation !== confirmationPhrase) || working) return;
    setWorking(true);
    setError(null);
    try {
      await onConfirm({
        password,
        ...(mfaCode.trim() ? { mfaCode: mfaCode.trim() } : {}),
        ...(confirmationPhrase ? { confirmation: confirmationPhrase } : {}),
      });
      setPassword("");
      setMfaCode("");
      setConfirmation("");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "The security action could not be completed."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#111214] p-5 sm:p-6">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
      {error ? <InlineAlert tone="error" title="Action failed" className="mt-4">{error}</InlineAlert> : null}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FieldFrame label="Current password" htmlFor={`${idPrefix}-password`}>
          <input id={`${idPrefix}-password`} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={fieldControlClass} />
        </FieldFrame>
        {mfaEnabled ? (
          <FieldFrame label="Authenticator or recovery code" htmlFor={`${idPrefix}-mfa`}>
            <input id={`${idPrefix}-mfa`} type="text" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} className={fieldControlClass} />
          </FieldFrame>
        ) : null}
        {confirmationPhrase ? (
          <FieldFrame label={`Type ${confirmationPhrase} to confirm`} htmlFor={`${idPrefix}-confirmation`}>
            <input
              id={`${idPrefix}-confirmation`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={fieldControlClass}
            />
          </FieldFrame>
        ) : null}
      </div>
      <Button
        type="submit"
        variant={destructive ? "danger" : "secondary"}
        className="mt-5"
        loading={working}
        disabled={!password || (mfaEnabled && !mfaCode.trim()) || Boolean(confirmationPhrase && confirmation !== confirmationPhrase)}
      >
        {confirmationLabel}
      </Button>
    </form>
  );
}

export default function AccountClient() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupWorking, setSetupWorking] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void getAccountProfile(controller.signal)
      .then(setProfile)
      .catch((caught) => setError(getUserFacingErrorMessage(normalizeApiError(caught), "Account details could not be loaded.")))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function beginMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setupPassword || setupWorking) return;
    setSetupWorking(true);
    setError(null);
    try {
      setSetup(await startMfaSetup(setupPassword));
      setSetupPassword("");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "Authenticator setup could not start."));
    } finally {
      setSetupWorking(false);
    }
  }

  async function finishMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setupCode.trim() || setupWorking) return;
    setSetupWorking(true);
    setError(null);
    try {
      const result = await enableMfa(setupCode.trim());
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setProfile((current) => current ? { ...current, mfaEnabled: true, recoveryCodesRemaining: result.recoveryCodes.length } : current);
      toast.success("Authenticator enabled. Save the recovery codes before signing in again.");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "The authenticator code could not be confirmed."));
    } finally {
      setSetupWorking(false);
    }
  }

  async function copyRecoveryCodes(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast.success("Recovery codes copied.");
    } catch {
      toast.error("Copy failed. Select and save the codes manually.");
    }
  }

  if (loading) return <div className="ff-container py-16 text-sm text-zinc-400" role="status">Loading account security…</div>;
  if (!profile) return <div className="ff-container py-16"><InlineAlert tone="error" title="Account unavailable">{error ?? "Account details could not be loaded."}</InlineAlert></div>;

  return (
    <div className="ff-container py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="ff-eyebrow">Account and security</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">Control access without clutter.</h1>
        <p className="mt-4 text-sm leading-7 text-zinc-400">Review your account, protect sign-in, export your data or remove the account.</p>
      </header>

      {error ? <InlineAlert tone="error" title="Account action failed" className="mt-6">{error}</InlineAlert> : null}
      {recoveryCodes.length > 0 ? (
        <InlineAlert tone="warning" title="Save these recovery codes now" className="mt-6">
          <p>Each code works once. They will not be shown again.</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-black/30 p-4 font-mono text-sm leading-7 text-amber-100">{recoveryCodes.join("\n")}</pre>
          <div className="mt-4 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => void copyRecoveryCodes()}>Copy codes</Button><Button type="button" variant="secondary" onClick={() => void signOut({ callbackUrl: "/login" })}>I saved them — sign in again</Button></div>
        </InlineAlert>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Account summary">
        <div className="rounded-2xl border border-white/10 bg-[#111214] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-600">Storage</p><p className="mt-3 text-xl font-black text-white">{bytes(profile.storageUsedBytes)}</p></div>
        <div className="rounded-2xl border border-white/10 bg-[#111214] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-600">Sign-in protection</p><p className="mt-3 text-xl font-black text-white">{profile.mfaEnabled ? "Authenticator on" : "Password only"}</p></div>
      </section>

      <section className="mt-8 rounded-2xl border border-white/10 bg-[#111214] p-5 sm:p-6" aria-labelledby="profile-title">
        <h2 id="profile-title" className="text-lg font-black text-white">Profile</h2>
        <p className="mt-2 break-words text-sm text-zinc-500">{profile.name} · {profile.email}</p>
      </section>

      <AccountPreferences
        profile={profile}
        onUpdated={(preferences) => setProfile((current) => current ? { ...current, ...preferences } : current)}
      />

      {!profile.mfaEnabled && recoveryCodes.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.04] p-5 sm:p-6" aria-labelledby="mfa-title">
          <h2 id="mfa-title" className="text-lg font-black text-white">Add an authenticator</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Protect invitations, approvals and account deletion with a second factor.</p>
          {!setup ? (
            <form onSubmit={beginMfa} className="mt-5 max-w-md">
              <FieldFrame label="Current password" htmlFor="mfa-setup-password"><input id="mfa-setup-password" type="password" autoComplete="current-password" value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} className={fieldControlClass} /></FieldFrame>
              <Button type="submit" variant="primary" className="mt-4" loading={setupWorking} disabled={!setupPassword}>Start setup</Button>
            </form>
          ) : (
            <form onSubmit={finishMfa} className="mt-5 max-w-xl space-y-4">
              <InlineAlert tone="info" title="Add this key to your authenticator"><p className="break-all font-mono text-sm">{setup.secret}</p><a className="mt-3 inline-flex font-bold text-emerald-200 underline" href={setup.otpAuthUrl}>Open authenticator app</a></InlineAlert>
              <FieldFrame label="Six-digit code" htmlFor="mfa-setup-code"><input id="mfa-setup-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={setupCode} onChange={(event) => setSetupCode(event.target.value.replace(/\D/gu, ""))} className={fieldControlClass} /></FieldFrame>
              <Button type="submit" variant="primary" loading={setupWorking} disabled={setupCode.length !== 6}>Confirm authenticator</Button>
            </form>
          )}
        </section>
      ) : null}

      {recoveryCodes.length === 0 ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <SecurityConfirmation
            idPrefix="export-account"
            title="Download account data"
            description="Confirm your password and authenticator, when enabled, before exporting projects, feedback, invitations and account records."
            mfaEnabled={profile.mfaEnabled}
            onConfirm={async (input) => {
              await downloadAccountExport({ password: input.password, ...(input.mfaCode ? { mfaCode: input.mfaCode } : {}) });
              toast.success("Account export downloaded.");
            }}
            confirmationLabel="Confirm and download"
          />
          {profile.mfaEnabled ? (
            <SecurityConfirmation idPrefix="disable-mfa" title="Disable authenticator" description="This removes the second factor and revokes every active session." mfaEnabled onConfirm={async (input) => { await confirmAccountSecurityAction(apiRoutes.account.mfaDisable, input); await signOut({ callbackUrl: "/login" }); }} confirmationLabel="Disable and sign out" />
          ) : null}
          <SecurityConfirmation idPrefix="revoke-sessions" title="Revoke all sessions" description="Use this after a lost device or suspicious sign-in. This browser will also sign out." mfaEnabled={profile.mfaEnabled} onConfirm={async (input) => { await confirmAccountSecurityAction(apiRoutes.account.revokeSessions, input); await signOut({ callbackUrl: "/login" }); }} confirmationLabel="Revoke sessions" />
          <SecurityConfirmation idPrefix="delete-account" confirmationPhrase="DELETE" title="Delete account" description="Access is removed immediately. Owned projects are closed and private files are queued for deletion while approval evidence stays auditable." mfaEnabled={profile.mfaEnabled} destructive onConfirm={async (input) => { await confirmAccountSecurityAction(apiRoutes.account.delete, input, "DELETE"); await signOut({ callbackUrl: "/" }); }} confirmationLabel="Delete account" />
        </div>
      ) : null}
    </div>
  );
}
