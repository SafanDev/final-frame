import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordClient from "@/components/auth/ResetPasswordClient";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      variant="simple"
      title="New password"
      description="Choose a new password for your account."
      footer={<Link href="/forgot-password" className="font-bold text-[var(--accent)] hover:text-[var(--accent-hover)]">Request another link</Link>}
    >
      <ResetPasswordClient />
    </AuthShell>
  );
}
