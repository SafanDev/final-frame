import type { Metadata } from "next";
import TrustPageShell from "@/components/public/TrustPageShell";
import TrustSection from "@/components/public/TrustSection";

export const metadata: Metadata = {
  title: "Support",
  description: "FinalFrame support and incident-reporting guidance.",
};

const guidance = [
  ["Include the request ID", "Error messages may show a request ID. Include it with the approximate time, action and affected project—never a password, session cookie or signed secret."],
  ["Access or invitation problem", "Ask the project owner to verify the invited email, invitation status and approver setting. Forwarded or already-used invitation links will not work."],
  ["File processing problem", "Provide the file type, approximate size and processing error. Do not send confidential originals through an unapproved support channel."],
  ["Security incident", "Revoke all sessions from Account, rotate exposed credentials through the deployment secret manager, preserve relevant logs and contact the assigned incident responder."],
  ["Data request", "Use Account for export or deletion. Owned projects are securely queued for deletion when an account is deleted."],
] as const;

export default function SupportPage() {
  return (
    <TrustPageShell
      active="/support"
      eyebrow="Help"
      title="Support"
      description="Use the private support contact supplied by the operator of your deployment. FinalFrame intentionally does not publish an invented global support address."
    >
      {guidance.map(([title, copy], index) => (
        <TrustSection key={title} number={String(index + 1).padStart(2, "0")} title={title}>
          <p>{copy}</p>
        </TrustSection>
      ))}
    </TrustPageShell>
  );
}
