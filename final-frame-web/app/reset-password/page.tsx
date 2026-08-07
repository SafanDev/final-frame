import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordClient from "@/components/auth/ResetPasswordClient";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return <AuthShell title="Choose a new password" description="Use the secure link from your email to choose a new password." footer={<Link href="/forgot-password" className="font-bold text-emerald-300">Request another link</Link>}><ResetPasswordClient /></AuthShell>;
}
