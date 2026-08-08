"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { getAccountProfile } from "@/lib/api/account";

export interface UserFormattingPreferences {
  locale: string;
  timeZone: string;
}

const defaults: UserFormattingPreferences = { locale: "en-US", timeZone: "UTC" };
const preferencesEvent = "finalframe:user-formatting-preferences";
const UserPreferencesContext = createContext<UserFormattingPreferences>(defaults);

export function publishUserFormattingPreferences(preferences: UserFormattingPreferences): void {
  window.dispatchEvent(new CustomEvent<UserFormattingPreferences>(preferencesEvent, { detail: preferences }));
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [preferences, setPreferences] = useState<UserFormattingPreferences>(defaults);

  useEffect(() => {
    if (status !== "authenticated") {
      setPreferences(defaults);
      return;
    }
    const controller = new AbortController();
    void getAccountProfile(controller.signal)
      .then((profile) => setPreferences({ locale: profile.locale, timeZone: profile.timeZone }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [status]);

  useEffect(() => {
    const update = (event: Event) => setPreferences((event as CustomEvent<UserFormattingPreferences>).detail);
    window.addEventListener(preferencesEvent, update);
    return () => window.removeEventListener(preferencesEvent, update);
  }, []);

  useEffect(() => {
    document.documentElement.lang = preferences.locale.split("-")[0] || "en";
  }, [preferences.locale]);

  const value = useMemo(() => preferences, [preferences]);
  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences(): UserFormattingPreferences {
  return useContext(UserPreferencesContext);
}
