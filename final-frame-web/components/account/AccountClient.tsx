"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { getAccountProfile, type AccountProfile } from "@/lib/api/account";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import AccountActions from "@/components/account/AccountActions";
import AccountPreferences from "@/components/account/AccountPreferences";
import AccountSecurity from "@/components/account/AccountSecurity";
import AccountSummary from "@/components/account/AccountSummary";

export default function AccountClient() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    void getAccountProfile(controller.signal)
      .then((nextProfile) => {
        if (controller.signal.aborted) return;
        setProfile(nextProfile);
        setError(null);
      })
      .catch((caught) => {
        const normalized = normalizeApiError(caught);
        if (normalized.kind === "aborted") return;
        setError(getUserFacingErrorMessage(normalized, "Account details could not be loaded."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  async function copyRecoveryCodes(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast.success("Recovery codes copied.");
    } catch {
      toast.error("Copy failed. Select and save the codes manually.");
    }
  }

  if (loading) return <div className="ff-container py-16 text-sm text-zinc-400" role="status">Loading account…</div>;
  if (!profile) return <div className="ff-container ff-account-load-error"><InlineAlert tone="error" title="Account could not be loaded">{error ?? "Account details could not be loaded."}</InlineAlert></div>;

  return (
    <div className="ff-container ff-account-page">
      <header className="ff-account-header">
        <h1>Account</h1>
        <p>Profile, preferences, and security.</p>
      </header>

      {error ? <InlineAlert tone="error" title="Something went wrong" className="ff-account-alert">{error}</InlineAlert> : null}
      {recoveryCodes.length > 0 ? (
        <InlineAlert tone="warning" title="Save your recovery codes" className="ff-account-recovery-alert">
          <p>Each code works once.</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-black/30 p-4 font-mono text-sm leading-7 text-amber-100">{recoveryCodes.join("\n")}</pre>
          <div className="mt-4 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => void copyRecoveryCodes()}>Copy codes</Button><Button type="button" variant="secondary" onClick={() => void signOut({ callbackUrl: "/login" })}>Saved — sign in again</Button></div>
        </InlineAlert>
      ) : null}

      <AccountSummary profile={profile} />

      <div className="ff-account-settings">
        <AccountPreferences
          profile={profile}
          onUpdated={(preferences) => setProfile((current) => current ? { ...current, ...preferences } : current)}
        />

        {recoveryCodes.length === 0 ? (
          <AccountSecurity
            enabled={profile.mfaEnabled}
            onEnabled={(codes) => {
              setRecoveryCodes(codes);
              setProfile((current) => current ? { ...current, mfaEnabled: true, recoveryCodesRemaining: codes.length } : current);
            }}
          />
        ) : null}

        {recoveryCodes.length === 0 ? <AccountActions profile={profile} /> : null}
      </div>
    </div>
  );
}
