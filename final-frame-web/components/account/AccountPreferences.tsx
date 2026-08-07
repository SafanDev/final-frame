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
        setEmailDeliveryAvailable(capabilities.emailDelivery);
        if (!capabilities.emailDelivery) setNotificationDelivery("IN_APP_ONLY");
      })
      .catch(() => setEmailDeliveryAvailable(null));
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
      toast.success("Account preferences updated.");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "Preferences could not be updated."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-white/10 bg-[#111214] p-5 sm:p-6" aria-labelledby="preferences-title">
      <h2 id="preferences-title" className="text-lg font-black text-white">Notifications and regional settings</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">Choose how review updates arrive and which time zone FinalFrame uses for digests and timestamps.</p>
      {error ? <InlineAlert tone="error" title="Preferences unavailable" className="mt-4">{error}</InlineAlert> : null}
      {emailDeliveryAvailable === false ? <InlineAlert tone="info" title="In-app notices are on" className="mt-4">Email delivery is off for this setup.</InlineAlert> : null}
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <FieldFrame label="Notification delivery" htmlFor="notification-delivery">
          <select id="notification-delivery" value={notificationDelivery} onChange={(event) => setNotificationDelivery(event.target.value as AccountProfile["notificationDelivery"])} className={fieldControlClass} disabled={emailDeliveryAvailable === false}>
            {emailDeliveryAvailable !== false ? <option value="IMMEDIATE">Immediate email</option> : null}
            {emailDeliveryAvailable !== false ? <option value="DAILY_DIGEST">Daily digest at 8:00 AM</option> : null}
            <option value="IN_APP_ONLY">In-app only</option>
          </select>
        </FieldFrame>
        <FieldFrame label="Locale" htmlFor="account-locale" hint="Examples: en-US, en-GB, si-LK">
          <input id="account-locale" value={locale} onChange={(event) => setLocale(event.target.value)} className={fieldControlClass} autoComplete="off" spellCheck={false} />
        </FieldFrame>
        <FieldFrame label="Time zone" htmlFor="account-time-zone" hint="Use an IANA zone such as Asia/Colombo">
          <input id="account-time-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className={fieldControlClass} autoComplete="off" spellCheck={false} />
        </FieldFrame>
      </div>
      <Button type="submit" variant="secondary" className="mt-5" loading={working}>Save preferences</Button>
    </form>
  );
}
