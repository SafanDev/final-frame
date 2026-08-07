import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Security", description: "Implemented FinalFrame security controls and deployment responsibilities." };

export default function SecurityPage() {
  return <div className="ff-container max-w-4xl py-14 sm:py-20"><p className="ff-eyebrow">Trust center</p><h1 className="mt-2 text-4xl font-black text-white sm:text-5xl">Security</h1><p className="mt-5 text-sm leading-7 text-zinc-400">Security is a maintained process, not a permanent guarantee. The controls below describe the source implementation; production strength also depends on correct secrets, infrastructure, monitoring, patching and release validation.</p><div className="mt-10 grid gap-4 sm:grid-cols-2">{[
    ["Identity", "Verified accounts, password recovery, lockout protection, optional MFA, database-backed sessions and immediate session revocation."],
    ["Authorization", "Project-scoped Designer and Client authority, explicit approvers, recipient-bound invitations and access revalidation for private media."],
    ["File safety", "Private originals, quarantine, signature and MIME inspection, malware scanning, bounded conversion and separate review derivatives."],
    ["Evidence", "Immutable review events, signed approval certificates, trusted-key verification and exportable audit streams."],
    ["Operations", "Readiness checks, Redis-backed distributed controls, bounded metrics, alerts, graceful shutdown and backup-aware migration gates."],
    ["Limitations", "A release is not approved until clean installs, migrations, tests, builds, browser checks, container startup and dependency audits pass in the target environment."],
  ].map(([title, copy]) => <section key={title} className="rounded-2xl border border-white/10 bg-[#111214] p-6"><h2 className="text-lg font-black text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{copy}</p></section>)}</div><p className="mt-8 text-sm leading-7 text-zinc-400">Report a suspected vulnerability through the private channel identified by your deployment operator. Do not include credentials or confidential customer content. See <Link href="/support" className="font-bold text-emerald-300 hover:text-emerald-200">support guidance</Link>.</p></div>;
}
