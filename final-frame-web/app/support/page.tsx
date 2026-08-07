import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support", description: "FinalFrame support and incident-reporting guidance." };

export default function SupportPage() {
  return <div className="ff-container max-w-4xl py-14 sm:py-20"><p className="ff-eyebrow">Help</p><h1 className="mt-2 text-4xl font-black text-white sm:text-5xl">Support</h1><p className="mt-5 text-sm leading-7 text-zinc-400">Use the private support contact supplied by the operator of your deployment. FinalFrame intentionally does not publish an invented global support address.</p><div className="mt-10 space-y-4">{[
    ["Include the request ID", "Error messages may show a request ID. Include it with the approximate time, action and affected project—never a password, session cookie or signed secret."],
    ["Access or invitation problem", "Ask the project owner to verify the invited email, invitation status and approver setting. Forwarded or already-used invitation links will not work."],
    ["File processing problem", "Provide the file type, approximate size and processing error. Do not send confidential originals through an unapproved support channel."],
    ["Security incident", "Revoke all sessions from Account, rotate exposed credentials through the deployment secret manager, preserve relevant logs and contact the assigned incident responder."],
    ["Data request", "Use Account for export or deletion. Owned projects are securely queued for deletion when an account is deleted."],
  ].map(([title, copy]) => <section key={title} className="rounded-2xl border border-white/10 bg-[#111214] p-6"><h2 className="text-lg font-black text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{copy}</p></section>)}</div></div>;
}
