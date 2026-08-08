"use server";

import { cookies } from "next/headers";
import { serverEnv, useSecureCookies } from "@/lib/env/server";

/**
 * Ends only the current browser session.
 *
 * NextAuth can split a large JWT cookie into numbered chunks, so every cookie
 * matching the configured session-cookie name must be expired together.
 */
export async function signOutCurrentUser(): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookieName = serverEnv.SESSION_COOKIE_NAME;

  const sessionCookieNames = cookieStore
    .getAll()
    .map((cookie) => cookie.name)
    .filter(
      (name) =>
        name === sessionCookieName ||
        name.startsWith(`${sessionCookieName}.`),
    );

  for (const name of sessionCookieNames) {
    cookieStore.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      expires: new Date(0),
      maxAge: 0,
    });
  }
}