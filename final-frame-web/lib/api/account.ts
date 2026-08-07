import { apiClient } from "./client";
import { apiRoutes } from "./routes";
import {
  accountPreferencesResponseSchema,
  accountProfileSchema,
  messageResponseSchema,
  mfaEnabledSchema,
  mfaSetupSchema,
} from "./schemas";
import type { z } from "zod";
import { downloadApiArtifact } from "./download";

export type AccountProfile = z.infer<typeof accountProfileSchema>;
export type MfaSetup = z.infer<typeof mfaSetupSchema>;
export type MfaEnabled = z.infer<typeof mfaEnabledSchema>;

export async function getAccountProfile(signal?: AbortSignal): Promise<AccountProfile> {
  return (await apiClient.request(apiRoutes.account.profile, {
    schema: accountProfileSchema,
    signal,
  })).data;
}

export async function startMfaSetup(password: string, signal?: AbortSignal): Promise<MfaSetup> {
  return (await apiClient.request(apiRoutes.account.mfaSetup, {
    method: "POST",
    body: { password },
    schema: mfaSetupSchema,
    signal,
  })).data;
}

export async function enableMfa(code: string, signal?: AbortSignal): Promise<MfaEnabled> {
  return (await apiClient.request(apiRoutes.account.mfaEnable, {
    method: "POST",
    body: { code },
    schema: mfaEnabledSchema,
    signal,
  })).data;
}

export async function confirmAccountSecurityAction(
  route: string,
  input: { password: string; mfaCode?: string; confirmation?: "DELETE" },
  method: "POST" | "DELETE" = "POST",
  signal?: AbortSignal,
): Promise<{ message: string; sessionRevoked?: boolean }> {
  return (await apiClient.request(route, {
    method,
    body: input,
    schema: messageResponseSchema,
    signal,
  })).data;
}

export async function downloadAccountExport(
  input: { password: string; mfaCode?: string },
  signal?: AbortSignal,
): Promise<void> {
  await downloadApiArtifact(apiRoutes.account.export, {
    method: "POST",
    body: input,
    fallbackFileName: "finalframe-account-export.ndjson",
    accept: "application/x-ndjson",
    signal,
  });
}


export async function updateAccountPreferences(
  input: { notificationDelivery: "IMMEDIATE" | "DAILY_DIGEST" | "IN_APP_ONLY"; locale: string; timeZone: string },
  signal?: AbortSignal,
) {
  return (await apiClient.request(apiRoutes.account.preferences, {
    method: "PATCH",
    body: input,
    schema: accountPreferencesResponseSchema,
    signal,
  })).data;
}
