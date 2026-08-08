import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AccountClient from "@/components/account/AccountClient";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your FinalFrame account, preferences, security, and data.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/account");
  return <AccountClient />;
}
