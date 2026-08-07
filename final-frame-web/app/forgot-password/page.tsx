import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <AuthShell title="Recover your account" description="Enter your email and we will send a short-lived reset link." footer={<Link href="/login" className="font-bold text-emerald-300">Return to sign in</Link>}><ForgotPasswordForm /></AuthShell>;
}
