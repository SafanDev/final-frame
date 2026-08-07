import type { MetadataRoute } from "next";
import { clientEnv } from "@/lib/env/client";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${clientEnv.NEXT_PUBLIC_SITE_NAME} — Design review and approval`,
    short_name: clientEnv.NEXT_PUBLIC_SITE_NAME,
    description:
      "Review versioned creative work, collect precise feedback and record client approval decisions.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["business", "productivity", "design"],
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
