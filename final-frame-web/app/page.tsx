import type { Metadata } from "next";
import HomeCTA from "@/components/public/HomeCTA";
import HomeHero from "@/components/public/HomeHero";
import ReviewFlow from "@/components/public/ReviewFlow";
import StructuredData from "@/components/seo/StructuredData";
import { clientEnv } from "@/lib/env/client";

const title = "Design review without the noise";
const description = "Review files, pin feedback, manage versions and record final approval in one focused workspace.";
const brandedTitle = `${clientEnv.NEXT_PUBLIC_SITE_NAME}: ${title}`;

export const metadata: Metadata = {
  title: { absolute: brandedTitle },
  description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: { title: brandedTitle, description, url: "/", type: "website" },
  twitter: { card: "summary_large_image", title: brandedTitle, description },
};

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: clientEnv.NEXT_PUBLIC_SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: clientEnv.NEXT_PUBLIC_SITE_URL,
    description,
    featureList: [
      "Visual feedback",
      "Asset versioning",
      "Voice notes",
      "Client approval",
      "Realtime collaboration",
    ],
  } as const;

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="ff-home-shell">
        <HomeHero />
        <ReviewFlow />
        <HomeCTA />
      </div>
    </>
  );
}
