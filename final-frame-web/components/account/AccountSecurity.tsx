"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { enableMfa, startMfaSetup, type MfaSetup } from "@/lib/api/account";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";

interface AccountSecurityProps {
  enabled: boolean;
  onEnabled: (recoveryCodes: string[]) => void;
}

export default function AccountSecurity({ enabled, onEnabled }: AccountSecurityProps) {
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || working) return;
    setWorking(true);
    setError(null);
    try {
      setSetup(await startMfaSetup(password));
      setPassword("");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "Two-step verification could not be started."));
    } finally {
      setWorking(false);
    }
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6 || working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await enableMfa(code);
      onEnabled(result.recoveryCodes);
      toast.success("Two-step verification is on.");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "That verification code could not be confirmed."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="ff-account-card ff-account-security-card" aria-labelledby="account-security-title">
      <div className="ff-account-card-heading ff-account-security-heading">
        <div>
          <h2 id="account-security-title">Sign-in security</h2>
          <p className="ff-account-card-description">Two-step verification</p>
        </div>
        <div className="ff-account-security-actions">
          <span className={`ff-account-status${enabled ? " is-on" : ""}`}>{enabled ? "On" : "Off"}</span>
          {!enabled && !expanded ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded(true)}>Set up</Button>
          ) : null}
        </div>
      </div>

      {!enabled && expanded ? (
        <div className="ff-account-security-panel">
          {error ? <InlineAlert tone="error" title="Could not continue" className="ff-account-compact-alert">{error}</InlineAlert> : null}
          {!setup ? (
            <form onSubmit={begin} className="ff-account-mfa-form">
              <FieldFrame label="Current password" htmlFor="mfa-setup-password">
                <input id="mfa-setup-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={fieldControlClass} />
              </FieldFrame>
              <div className="ff-account-action-controls">
                <Button type="submit" variant="primary" size="sm" loading={working} disabled={!password}>Continue</Button>
                <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => { setExpanded(false); setPassword(""); setError(null); }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={finish} className="ff-account-mfa-setup">
              <div className="ff-account-mfa-key">
                <span>Setup key</span>
                <code>{setup.secret}</code>
                <a href={setup.otpAuthUrl}>Open authenticator app</a>
              </div>
              <FieldFrame label="Six-digit code" htmlFor="mfa-setup-code">
                <input id="mfa-setup-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, ""))} className={fieldControlClass} />
              </FieldFrame>
              <div className="ff-account-action-controls">
                <Button type="submit" variant="primary" size="sm" loading={working} disabled={code.length !== 6}>Turn on</Button>
                <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => { setSetup(null); setCode(""); setExpanded(false); setError(null); }}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}
