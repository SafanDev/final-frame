import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { GuestSiteFooter, GuestSiteHeader } from "@/components/navigation/GuestSiteChrome";
import { clientEnv } from "@/lib/env/client";
import "./globals.css";

const description =
  "FinalFrame is a secure design review and approval workspace for versioned assets, precise feedback, collaboration and accountable client decisions.";

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_SITE_URL),
  applicationName: clientEnv.NEXT_PUBLIC_SITE_NAME,
  title: {
    default: "FinalFrame — Design review and approval workspace",
    template: `%s | ${clientEnv.NEXT_PUBLIC_SITE_NAME}`,
  },
  description,
  category: "technology",
  creator: clientEnv.NEXT_PUBLIC_SITE_NAME,
  publisher: clientEnv.NEXT_PUBLIC_SITE_NAME,
  keywords: [
    "design review software",
    "client approval platform",
    "visual feedback",
    "creative collaboration",
    "asset versioning",
    "design proofing",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    siteName: clientEnv.NEXT_PUBLIC_SITE_NAME,
    title: "FinalFrame — Design review and approval workspace",
    description,
    url: clientEnv.NEXT_PUBLIC_SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "FinalFrame — Design review and approval workspace",
    description,
  },
  verification: {
    google: clientEnv.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: clientEnv.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": clientEnv.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#090a0c",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // A request-specific CSP nonce requires runtime rendering.
  await connection();
  const session = await getCurrentSession();

  let telemetry: React.ReactNode = null;
  if (clientEnv.NEXT_PUBLIC_TELEMETRY_ENABLED) {
    const { default: WebVitalsReporter } = await import("@/components/observability/WebVitalsReporter");
    telemetry = <WebVitalsReporter />;
  }

  let authenticatedHeader: React.ReactNode = null;
  let authenticatedFooter: React.ReactNode = null;
  if (session?.user) {
    const [{ default: Navbar }, { default: Footer }] = await Promise.all([
      import("@/components/Navbar"),
      import("@/components/Footer"),
    ]);
    authenticatedHeader = <Navbar currentUser={{ name: session.user.name }} />;
    authenticatedFooter = <Footer />;
  }

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {telemetry}
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {session?.user ? authenticatedHeader : <GuestSiteHeader />}
        <main id="main-content" tabIndex={-1} className="relative z-10 flex min-h-0 flex-1 flex-col">
          {children}
        </main>
        {session?.user ? authenticatedFooter : <GuestSiteFooter />}
      </body>
    </html>
  );
}
