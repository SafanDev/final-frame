import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import VerifyEmailClient from "@/components/auth/VerifyEmailClient";

export const metadata: Metadata = { title: "Verify email", robots: { index: false, follow: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ sent?: string | string[]; email?: string | string[] }> }) {
  const params = await searchParams;
  const sent = (Array.isArray(params.sent) ? params.sent[0] : params.sent) === "1";
  const rawEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const email = typeof rawEmail === "string" && rawEmail.length <= 254 ? rawEmail : "";
  return (
    <AuthShell
      variant="simple"
      title="Verify email"
      description="Check your email to continue."
      footer={<Link href="/login" className="font-bold text-[var(--accent)] hover:text-[var(--accent-hover)]">Return to sign in</Link>}
    >
      <VerifyEmailClient sent={sent} email={email} />
    </AuthShell>
  );
}
