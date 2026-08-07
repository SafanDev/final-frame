import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      variant="simple"
      title="Reset password"
      description="We will send a reset link to your email."
      footer={<Link href="/login" className="font-bold text-[var(--accent)] hover:text-[var(--accent-hover)]">Return to sign in</Link>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
