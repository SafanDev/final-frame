import type { Metadata } from "next";
import InviteTokenBridge from "@/components/invitations/InviteTokenBridge";

export const metadata: Metadata = {
  title: "Project invitation",
  description: "Accept a private FinalFrame project invitation.",
  robots: { index: false, follow: false },
};

export default function InvitePage() {
  return <InviteTokenBridge />;
}
