"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { updateAccountPreferences, type AccountProfile } from "@/lib/api/account";
import { getAuthCapabilities } from "@/lib/api/auth";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import Button from "@/components/ui/Button";
import { FieldFrame, fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";
import { publishUserFormattingPreferences } from "@/contexts/UserPreferencesContext";

export default function AccountPreferences({
  profile,
  onUpdated,
}: {
  profile: AccountProfile;
  onUpdated: (preferences: Pick<AccountProfile, "notificationDelivery" | "locale" | "timeZone">) => void;
}) {
  const [notificationDelivery, setNotificationDelivery] = useState(profile.notificationDelivery);
  const [locale, setLocale] = useState(profile.locale);
  const [timeZone, setTimeZone] = useState(profile.timeZone);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailDeliveryAvailable, setEmailDeliveryAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getAuthCapabilities(controller.signal)
      .then((capabilities) => {
        if (controller.signal.aborted) return;
        setEmailDeliveryAvailable(capabilities.emailDelivery);
        if (!capabilities.emailDelivery) setNotificationDelivery("IN_APP_ONLY");
      })
      .catch((caught) => {
        const normalized = normalizeApiError(caught);
        if (normalized.kind === "aborted") return;
        setEmailDeliveryAvailable(null);
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await updateAccountPreferences({
        notificationDelivery: emailDeliveryAvailable === false ? "IN_APP_ONLY" : notificationDelivery,
        locale: locale.trim(),
        timeZone: timeZone.trim(),
      });
      onUpdated(result);
      setLocale(result.locale);
      setTimeZone(result.timeZone);
      publishUserFormattingPreferences({ locale: result.locale, timeZone: result.timeZone });
      toast.success("Preferences saved.");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "Preferences could not be saved."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="ff-account-card ff-account-preferences-card" aria-labelledby="preferences-title">
      <div className="ff-account-card-heading">
        <div>
          <h2 id="preferences-title">Preferences</h2>
          {emailDeliveryAvailable === false ? (
            <p className="ff-account-note"><span aria-hidden="true" />Email is off. Updates stay in Inbox.</p>
          ) : null}
        </div>
        <Button type="submit" variant="secondary" size="sm" loading={working}>Save</Button>
      </div>
      {error ? <InlineAlert tone="error" title="Could not save" className="ff-account-compact-alert">{error}</InlineAlert> : null}

      <div className="ff-account-preference-grid">
        <FieldFrame label="Updates" htmlFor="notification-delivery">
          <select id="notification-delivery" value={notificationDelivery} onChange={(event) => setNotificationDelivery(event.target.value as AccountProfile["notificationDelivery"])} className={fieldControlClass} disabled={emailDeliveryAvailable === false}>
            {emailDeliveryAvailable !== false ? <option value="IMMEDIATE">Email right away</option> : null}
            {emailDeliveryAvailable !== false ? <option value="DAILY_DIGEST">Daily email</option> : null}
            <option value="IN_APP_ONLY">Inbox only</option>
          </select>
        </FieldFrame>
        <FieldFrame label="Region" htmlFor="account-locale">
          <input id="account-locale" value={locale} onChange={(event) => setLocale(event.target.value)} className={fieldControlClass} placeholder="en-US" autoComplete="off" spellCheck={false} />
        </FieldFrame>
        <FieldFrame label="Time zone" htmlFor="account-time-zone">
          <input id="account-time-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className={fieldControlClass} placeholder="Asia/Colombo" autoComplete="off" spellCheck={false} />
        </FieldFrame>
      </div>
    </form>
  );
}
