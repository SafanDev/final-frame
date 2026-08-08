"use client";

import AppToaster from "@/components/AppToaster";
import AuthProvider from "@/components/AuthProvider";
import SessionExpiryListener from "@/components/auth/SessionExpiryListener";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";

export default function ProductProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <SessionExpiryListener />
      <UserPreferencesProvider>{children}</UserPreferencesProvider>
      <AppToaster />
    </AuthProvider>
  );
}