"use client";

import SessionExpiryListener from "@/components/auth/SessionExpiryListener";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";

export default function ProductProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SessionExpiryListener />
      <UserPreferencesProvider>{children}</UserPreferencesProvider>
    </>
  );
}