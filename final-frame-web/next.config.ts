import type { NextConfig } from "next";
import { createHstsHeader, type HstsScope } from "./lib/security/hsts-core";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const isHttpsDeployment = siteUrl.startsWith("https://");
const isProductionDeployment = process.env.DEPLOYMENT_ENVIRONMENT === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), geolocation=(), payment=(), usb=(), browsing-topics=(), microphone=(self)",
  },
];

const hstsHeader = createHstsHeader({
  enabled: isProductionDeployment && isHttpsDeployment,
  scope: (process.env.HSTS_SCOPE || "host") as HstsScope,
  maxAgeSeconds: Number(process.env.HSTS_MAX_AGE_SECONDS || "15552000"),
  domainControlConfirmed: process.env.HSTS_DOMAIN_CONTROL_CONFIRMED === "true",
});
if (hstsHeader) securityHeaders.push({ key: "Strict-Transport-Security", value: hstsHeader });

const privateRouteHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  images: {
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: false,
  },
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      { source: "/app", headers: privateRouteHeaders },
      { source: "/app/:path*", headers: privateRouteHeaders },
      { source: "/project/:path*", headers: privateRouteHeaders },
      { source: "/invite", headers: privateRouteHeaders },
      { source: "/invite/:path*", headers: privateRouteHeaders },
      { source: "/login", headers: privateRouteHeaders },
      { source: "/register", headers: privateRouteHeaders },
      { source: "/forgot-password", headers: privateRouteHeaders },
      { source: "/reset-password", headers: privateRouteHeaders },
      { source: "/verify-email", headers: privateRouteHeaders },
      { source: "/account", headers: privateRouteHeaders },
      { source: "/api/:path*", headers: privateRouteHeaders },
    ];
  },
};

export default nextConfig;
