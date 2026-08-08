import type { Metadata } from "next";
import Link from "next/link";
import TrustPageShell from "@/components/public/TrustPageShell";
import TrustSection from "@/components/public/TrustSection";

export const metadata: Metadata = {
  title: "Security",
  description: "Implemented FinalFrame security controls and deployment responsibilities.",
};

const controls = [
  ["Identity", "Verified accounts, password recovery, lockout protection, optional MFA, database-backed sessions and immediate session revocation."],
  ["Authorization", "Project-scoped Designer and Client authority, explicit approvers, recipient-bound invitations and access revalidation for private media."],
  ["File safety", "Private originals, quarantine, signature and MIME inspection, malware scanning, bounded conversion and separate review derivatives."],
  ["Evidence", "Immutable review events, signed approval certificates, trusted-key verification and exportable audit streams."],
  ["Operations", "Readiness checks, Redis-backed distributed controls, bounded metrics, alerts, graceful shutdown and backup-aware migration gates."],
  ["Limitations", "A release is not approved until clean installs, migrations, tests, builds, browser checks, container startup and dependency audits pass in the target environment."],
] as const;

export default function SecurityPage() {
  return (
    <TrustPageShell
      active="/security"
      eyebrow="Trust center"
      title="Security"
      description="Security is a maintained process, not a permanent guarantee. The controls below describe the source implementation; production strength also depends on correct secrets, infrastructure, monitoring, patching and release validation."
      note={
        <p>
          Report a suspected vulnerability through the private channel identified by your deployment operator. Do not include credentials or confidential customer content. See{" "}
          <Link href="/support">support guidance</Link>.
        </p>
      }
    >
      {controls.map(([title, copy], index) => (
        <TrustSection key={title} number={String(index + 1).padStart(2, "0")} title={title}>
          <p>{copy}</p>
        </TrustSection>
      ))}
    </TrustPageShell>
  );
}
