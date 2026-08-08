import type { Metadata } from "next";
import TrustPageShell from "@/components/public/TrustPageShell";
import TrustSection from "@/components/public/TrustSection";

export const metadata: Metadata = { title: "Terms of use" };

const sections = [
  ["Accounts and project access", "Keep credentials private. Any signed-in user may create a project and becomes its owner. Client access is granted only through a project invitation and can be removed by the project owner."],
  ["Content", "Upload only material you are authorized to review and share. Executables, active web content and unsafe or mismatched files may be rejected, quarantined or removed."],
  ["Review decisions", "Approval records identify the selected final file, actor and project version. Users remain responsible for confirming that the recorded decision matches their commercial or legal approval process."],
  ["Acceptable use", "Do not probe other accounts, bypass access controls, upload malware, abuse invitations, overload the service or use FinalFrame to violate law or third-party rights."],
  ["Availability and limits", "Service availability depends on the operator’s infrastructure. Storage, project and AI limits are enforced to keep the service stable and safe."],
  ["Changes", "The deployment operator should publish effective dates and notify users when its binding agreement or privacy terms materially change."],
] as const;

export default function TermsPage() {
  return (
    <TrustPageShell
      active="/terms"
      eyebrow="Trust center"
      title="Terms of use"
      description="These are product-level operating terms, not a substitute for the agreement issued by the person or company running this FinalFrame deployment."
    >
      {sections.map(([title, copy], index) => (
        <TrustSection key={title} number={String(index + 1).padStart(2, "0")} title={title}>
          <p>{copy}</p>
        </TrustSection>
      ))}
    </TrustPageShell>
  );
}
