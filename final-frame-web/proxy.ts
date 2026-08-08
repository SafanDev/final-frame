import { randomBytes } from "node:crypto";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientEnv } from "@/lib/env/client";
import { isNodeProduction, serverEnv, useSecureCookies } from "@/lib/env/server";
import { safeRelativeCallback } from "@/lib/auth/redirects";
import { createContentSecurityPolicy } from "@/lib/security/csp-core";

const protectedRoutes = ["/app", "/project", "/account", "/notifications"] as const;
const authenticationRoutes = ["/login", "/register"] as const;

function routeMatches(pathname: string, routes: readonly string[]): boolean {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function withSecurityHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const contentSecurityPolicy = createContentSecurityPolicy({
    nonce,
    apiUrl: clientEnv.NEXT_PUBLIC_API_URL,
    siteUrl: clientEnv.NEXT_PUBLIC_SITE_URL,
    storageOrigin: clientEnv.NEXT_PUBLIC_STORAGE_ORIGIN,
    production: isNodeProduction,
    upgradeInsecureRequests: useSecureCookies,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  let token: Awaited<ReturnType<typeof getToken>> = null;
  try {
    token = await getToken({
      req: request,
      secret: serverEnv.NEXTAUTH_SECRET,
      cookieName: serverEnv.SESSION_COOKIE_NAME,
      secureCookie: useSecureCookies,
    });
  } catch {
    token = null;
  }

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = routeMatches(pathname, protectedRoutes);
  const isAuthenticationRoute = routeMatches(pathname, authenticationRoutes);

  if (isProtectedRoute && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "callbackUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return withSecurityHeaders(NextResponse.redirect(loginUrl), contentSecurityPolicy);
  }

  if (isAuthenticationRoute && token) {
    const callbackUrl = safeRelativeCallback(request.nextUrl.searchParams.get("callbackUrl"));
    const safeDestination = routeMatches(callbackUrl.split("?")[0] || "/", authenticationRoutes)
      ? "/app"
      : callbackUrl;
    return withSecurityHeaders(
      NextResponse.redirect(new URL(safeDestination, request.url)),
      contentSecurityPolicy,
    );
  }

  return withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    contentSecurityPolicy,
  );
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|robots.txt|sitemap.xml|manifest.webmanifest|pdf.worker.min.mjs|cmaps|standard_fonts).*)",
  ],
};
