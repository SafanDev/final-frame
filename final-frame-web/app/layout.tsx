import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Toaster } from "sonner";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WebVitalsReporter from "@/components/observability/WebVitalsReporter";
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

  return (
    <html lang="en">
      <body>
        <WebVitalsReporter />
        <AuthProvider>
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>
          <Toaster
            position="top-center"
            theme="dark"
            richColors
            closeButton
            expand
            toastOptions={{
              classNames: {
                toast: "finalframe-toast",
                title: "finalframe-toast-title",
                description: "finalframe-toast-description",
              },
            }}
          />
          <Navbar />
          <main id="main-content" tabIndex={-1} className="relative z-10 flex min-h-0 flex-1 flex-col">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
