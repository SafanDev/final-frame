import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { serverEnv, useSecureCookies } from "@/lib/env/server";
import { loginResponseSchema } from "@/lib/api/schemas";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
  mfaCode: z.string().trim().min(6).max(32).optional(),
});

const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const actionableAuthErrors = new Set(["MFA_REQUIRED", "EMAIL_NOT_VERIFIED", "ACCOUNT_SUSPENDED"]);

async function verifyCredentials(credentials: unknown): Promise<User | null> {
  const input = credentialsSchema.safeParse(credentials);
  if (!input.success) return null;

  try {
    const response = await fetch(`${serverEnv.API_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input.data),
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { code?: unknown } | null;
      const code = typeof failure?.code === "string" ? failure.code : null;
      if (code && actionableAuthErrors.has(code)) throw new Error(code);
      return null;
    }

    const payload: unknown = await response.json();
    const parsed = loginResponseSchema.safeParse(payload);
    if (!parsed.success) return null;

    return parsed.data.user;
  } catch (error) {
    if (error instanceof Error && actionableAuthErrors.has(error.message)) throw error;
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  secret: serverEnv.NEXTAUTH_SECRET,
  useSecureCookies,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  cookies: {
    sessionToken: {
      name: serverEnv.SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "Authenticator or recovery code", type: "text" },
      },
      authorize: verifyCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
};
