"use client";

import { SessionProvider } from "next-auth/react";
import SessionExpiryListener from "@/components/auth/SessionExpiryListener";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus refetchWhenOffline={false}>
      <SessionExpiryListener />
      <UserPreferencesProvider>{children}</UserPreferencesProvider>
    </SessionProvider>
  );
}
