import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy", description: "How FinalFrame handles account, project and diagnostic data." };

const sections = [
  ["Data FinalFrame stores", "Account identity, project access, project files and derivatives, feedback, approval evidence, security sessions, delivery records, usage counters and limited diagnostic events needed to operate the service."],
  ["Files and review content", "Original files remain private objects. Authenticated API routes recheck project access whenever a preview, download or voice note is requested. Review derivatives may be generated for safer browser viewing."],
  ["AI summaries", "AI summaries are disabled unless a project owner enables them. Written feedback may then be sent to the processor configured by the deployment. Do not enable AI for content that policy or contract prohibits from leaving the deployment boundary."],
  ["Voice transcription", "Voice recording does not require transcription. Browser live transcription is a separate opt-in; the browser or its speech-service provider may process spoken audio. A manual transcript remains available."],
  ["Security and diagnostics", "FinalFrame records bounded request identifiers, trace context, authentication events and operational metrics. Request bodies, passwords, cookies, private keys and reusable object-storage credentials must not be included in telemetry."],
  ["Retention and deletion", "Account deletion removes access immediately and queues private project content for secure deletion while approval evidence may be retained for audit integrity. Exact retention periods and legal-hold rules are controlled by the operator of your deployment."],
  ["Your controls", "The account page supports session revocation, MFA, data export, notification preferences and account deletion. Project owners control invitations and client access."],
] as const;

export default function PrivacyPage() {
  return <div className="ff-container max-w-4xl py-14 sm:py-20"><p className="ff-eyebrow">Trust center</p><h1 className="mt-2 text-4xl font-black text-white sm:text-5xl">Privacy</h1><p className="mt-5 text-sm leading-7 text-zinc-400">This product notice describes the implemented data flows. Your deployment operator remains responsible for its legal notices, configured processors, retention schedule and contact details.</p><div className="mt-10 divide-y divide-white/10 border-y border-white/10">{sections.map(([title, copy]) => <section key={title} className="py-6"><h2 className="text-xl font-black text-white">{title}</h2><p className="mt-2 text-sm leading-7 text-zinc-400">{copy}</p></section>)}</div></div>;
}
