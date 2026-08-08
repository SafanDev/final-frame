import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NotificationInbox from "@/components/notifications/NotificationInbox";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Inbox",
  description: "Review FinalFrame invitations, feedback and approval updates.",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/notifications");
  return (
    <main className="ff-container ff-inbox-page">
      <header className="ff-inbox-header">
        <h1>Inbox</h1>
        <p>Invites, feedback, and approvals.</p>
      </header>
      <NotificationInbox />
    </main>
  );
}
