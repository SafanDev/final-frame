import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <div className="ff-container max-w-4xl py-14 sm:py-20">
      <p className="ff-eyebrow">Trust center</p>
      <h1 className="mt-2 text-4xl font-black text-white sm:text-5xl">Terms of use</h1>
      <p className="mt-5 text-sm leading-7 text-zinc-400">These are product-level operating terms, not a substitute for the agreement issued by the person or company running this FinalFrame deployment.</p>
      <div className="mt-10 space-y-7 text-sm leading-7 text-zinc-400">
        <section><h2 className="text-xl font-black text-white">Accounts and project access</h2><p className="mt-2">Keep credentials private. Any signed-in user may create a project and becomes its owner. Client access is granted only through a project invitation and can be removed by the project owner.</p></section>
        <section><h2 className="text-xl font-black text-white">Content</h2><p className="mt-2">Upload only material you are authorized to review and share. Executables, active web content and unsafe or mismatched files may be rejected, quarantined or removed.</p></section>
        <section><h2 className="text-xl font-black text-white">Review decisions</h2><p className="mt-2">Approval records identify the selected final file, actor and project version. Users remain responsible for confirming that the recorded decision matches their commercial or legal approval process.</p></section>
        <section><h2 className="text-xl font-black text-white">Acceptable use</h2><p className="mt-2">Do not probe other accounts, bypass access controls, upload malware, abuse invitations, overload the service or use FinalFrame to violate law or third-party rights.</p></section>
        <section><h2 className="text-xl font-black text-white">Availability and limits</h2><p className="mt-2">Service availability depends on the operator’s infrastructure. Storage, project and AI limits are enforced to keep the service stable and safe.</p></section>
        <section><h2 className="text-xl font-black text-white">Changes</h2><p className="mt-2">The deployment operator should publish effective dates and notify users when its binding agreement or privacy terms materially change.</p></section>
      </div>
    </div>
  );
}
