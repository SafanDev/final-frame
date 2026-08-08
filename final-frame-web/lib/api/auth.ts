import { z } from "zod";
import { apiClient } from "./client";
import { apiRoutes } from "./routes";
import { authCapabilitiesSchema, messageResponseSchema, registerResponseSchema } from "./schemas";
import type { AuthCapabilities, RegisterResponse } from "./types";

export interface RegisterAccountInput {
  name: string;
  email: string;
  password: string;
}

export async function getAuthCapabilities(signal?: AbortSignal): Promise<AuthCapabilities> {
  return (await apiClient.request(apiRoutes.auth.capabilities, {
    method: "GET",
    schema: authCapabilitiesSchema,
    signal,
  })).data;
}

export async function registerAccount(
  input: RegisterAccountInput,
  signal?: AbortSignal,
): Promise<RegisterResponse> {
  return (await apiClient.request(apiRoutes.auth.register, {
    method: "POST",
    body: input,
    schema: registerResponseSchema,
    signal,
    retryCount: 0,
  })).data;
}

export async function requestEmailVerification(email: string, signal?: AbortSignal): Promise<string> {
  return (await apiClient.request(apiRoutes.auth.requestEmailVerification, {
    method: "POST",
    body: { email },
    schema: messageResponseSchema,
    signal,
  })).data.message;
}

export async function requestPasswordReset(email: string, signal?: AbortSignal): Promise<string> {
  return (await apiClient.request(apiRoutes.auth.requestPasswordReset, {
    method: "POST",
    body: { email },
    schema: messageResponseSchema,
    signal,
  })).data.message;
}

export async function confirmPasswordReset(token: string, password: string, signal?: AbortSignal): Promise<string> {
  return (await apiClient.request(apiRoutes.auth.confirmPasswordReset, {
    method: "POST",
    body: { token, password },
    schema: messageResponseSchema,
    signal,
  })).data.message;
}

export async function verifyEmailAddress(token: string, signal?: AbortSignal): Promise<string> {
  return (await apiClient.request(apiRoutes.auth.verifyEmail, {
    method: "POST",
    body: { token },
    schema: messageResponseSchema,
    signal,
  })).data.message;
}

export const passwordRules = z.object({
  password: z.string().min(12).max(128),
});
