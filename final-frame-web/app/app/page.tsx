import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Projects",
  description: "Manage private FinalFrame design review projects and client decisions.",
  alternates: { canonical: "/app" },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/app");

  return (
    <DashboardClient
      currentUser={{
        id: session.user.id,
        name: session.user.name ?? "FinalFrame user",
        email: session.user.email ?? "",
      }}
    />
  );
}
