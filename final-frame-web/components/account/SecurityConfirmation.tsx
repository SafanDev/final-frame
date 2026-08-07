"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";

interface SecurityConfirmationProps {
  title: string;
  description: string;
  mfaEnabled: boolean;
  destructive?: boolean;
  confirmationLabel: string;
  confirmationPhrase?: "DELETE";
  idPrefix: string;
  onConfirm: (input: { password: string; mfaCode?: string; confirmation?: "DELETE" }) => Promise<void>;
}

export default function SecurityConfirmation({
  title,
  description,
  mfaEnabled,
  destructive = false,
  confirmationLabel,
  confirmationPhrase,
  idPrefix,
  onConfirm,
}: SecurityConfirmationProps) {
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close(): void {
    if (working) return;
    setExpanded(false);
    setPassword("");
    setMfaCode("");
    setConfirmation("");
    setError(null);
  }

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
      setExpanded(false);
      setPassword("");
      setMfaCode("");
      setConfirmation("");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "This action could not be completed."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={`ff-account-action-card${destructive ? " is-danger" : ""}${expanded ? " is-open" : ""}`}
    >
      <div className="ff-account-action-head">
        <div className="ff-account-action-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {!expanded ? (
          <Button
            type="button"
            variant={destructive ? "danger" : "ghost"}
            size="sm"
            onClick={() => setExpanded(true)}
            aria-expanded="false"
          >
            {destructive ? "Delete" : "Continue"}
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div className="ff-account-action-panel">
          {error ? <InlineAlert tone="error" title="Could not complete" className="ff-account-action-alert">{error}</InlineAlert> : null}

          <div className="ff-account-action-fields">
            <FieldFrame label="Password" htmlFor={`${idPrefix}-password`}>
              <input id={`${idPrefix}-password`} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={fieldControlClass} />
            </FieldFrame>
            {mfaEnabled ? (
              <FieldFrame label="Verification code" htmlFor={`${idPrefix}-mfa`}>
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

          <div className="ff-account-action-controls">
            <Button
              type="submit"
              variant={destructive ? "danger" : "secondary"}
              size="sm"
              loading={working}
              disabled={!password || (mfaEnabled && !mfaCode.trim()) || Boolean(confirmationPhrase && confirmation !== confirmationPhrase)}
            >
              {confirmationLabel}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={close} disabled={working}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
