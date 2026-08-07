import type { MetadataRoute } from "next";
import { clientEnv } from "@/lib/env/client";

export default function robots(): MetadataRoute.Robots {
  if (process.env.NODE_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: ["/"],
      disallow: ["/api/", "/app", "/project/", "/invite/", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/account"],
    },
    sitemap: `${clientEnv.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
    host: clientEnv.NEXT_PUBLIC_SITE_URL,
  };
}
