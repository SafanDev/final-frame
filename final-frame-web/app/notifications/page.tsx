import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NotificationInbox from "@/components/notifications/NotificationInbox";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Review FinalFrame invitations, feedback and approval updates.",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/notifications");
  return (
    <main className="ff-container py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="ff-eyebrow">Notification inbox</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">Review every update in one place.</h1>
        <p className="mt-4 text-sm leading-7 text-zinc-400">Invitations, feedback and approval decisions remain available even when email delivery is disabled or delayed.</p>
      </header>
      <section className="mt-8" aria-label="Notifications"><NotificationInbox /></section>
    </main>
  );
}
