import type { MetadataRoute } from "next";
import { clientEnv } from "@/lib/env/client";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: clientEnv.NEXT_PUBLIC_SITE_URL, lastModified: now, changeFrequency: "monthly", priority: 1 },
    ...["privacy", "terms", "security", "support"].map((path) => ({
      url: `${clientEnv.NEXT_PUBLIC_SITE_URL}/${path}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.4,
    })),
  ];
}
