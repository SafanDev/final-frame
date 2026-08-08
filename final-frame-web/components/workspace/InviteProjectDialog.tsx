"use client";

import { useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from "react";
import { toast } from "sonner";
import Dialog from "@/components/ui/Dialog";
import InlineAlert from "@/components/ui/InlineAlert";
import { createProjectInvite } from "@/lib/api/projects";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { formatDateTime } from "@/lib/utils/format";

interface InviteProjectDialogProps {
  open: boolean;
  projectId: string;
  projectTitle: string;
  projectVersion: number;
  onClose: () => void;
  onInvited: (projectVersion: number) => Promise<void> | void;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Clipboard unavailable.");
}

export default function InviteProjectDialog({
  open,
  projectId,
  projectTitle,
  projectVersion,
  onClose,
  onInvited,
}: InviteProjectDialogProps) {
  const preferences = useUserPreferences();
  const emailRef = useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = useState("");
  const [canApprove, setCanApprove] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  function resetAndClose() {
    if (isSubmitting) return;
    setEmail("");
    setCanApprove(true);
    setInviteUrl(null);
    setExpiresAt(null);
    setDeliveryStatus(null);
    setError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recipient = email.trim().toLowerCase();
    if (!recipient || !emailRef.current?.checkValidity()) {
      emailRef.current?.reportValidity();
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setDeliveryStatus(null);
    try {
      const result = await createProjectInvite(projectId, {
        email: recipient,
        canApprove,
        expectedVersion: projectVersion,
      });
      setInviteUrl(result.inviteUrl);
      setExpiresAt(result.expiresAt);
      setDeliveryStatus(result.deliveryStatus);
      void Promise.resolve(onInvited(result.projectVersion));
      toast.success(result.deliveryStatus === "SENT" ? "Client invitation sent." : "Invite link ready.");
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setError({
        message: getUserFacingErrorMessage(caught, "The invitation could not be created."),
        requestId: normalized.requestId,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyExisting() {
    if (!inviteUrl) return;
    try {
      await copyText(inviteUrl);
      toast.success("Invitation link copied.");
    } catch {
      setError({ message: "The browser blocked clipboard access. Select and copy the link manually.", requestId: null });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={resetAndClose}
      title="Invite a client"
      description={`Invite one Client to ${projectTitle}. The link works once and only for the email entered below.`}
      busy={isSubmitting}
      initialFocusRef={emailRef}
      maxWidthClassName="max-w-xl"
      footer={<button type="button" onClick={resetAndClose} disabled={isSubmitting} className="min-h-11 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50">Close</button>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="invite-email" className="mb-2 block text-sm font-semibold text-zinc-200">Client email</label>
          <input
            ref={emailRef}
            id="invite-email"
            type="email"
            required
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
            placeholder="client@example.com"
            disabled={isSubmitting}
            className="min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <input type="checkbox" checked={canApprove} onChange={(event) => setCanApprove(event.target.checked)} disabled={isSubmitting} className="mt-0.5 h-4 w-4 accent-emerald-400" />
          <span>
            <span className="block text-sm font-semibold text-white">Can give final approval</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">Turn this off for a Client who should comment but not make the final decision.</span>
          </span>
        </label>

        <button type="submit" disabled={isSubmitting || !email.trim()} className="min-h-11 w-full rounded-xl bg-emerald-400 px-5 text-sm font-bold text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Creating invitation…" : "Create invite"}</button>
      </form>

      {error ? <InlineAlert tone="error" title="Invitation failed" requestId={error.requestId} className="mt-5">{error.message}</InlineAlert> : null}
      {deliveryStatus ? (
        <InlineAlert
          tone={deliveryStatus === "SENT" || deliveryStatus === "CANCELLED" ? "success" : "warning"}
          title={deliveryStatus === "SENT" ? "Invitation sent" : deliveryStatus === "CANCELLED" ? "Invite link ready" : "Invitation queued"}
          className="mt-5"
        >
          {deliveryStatus === "SENT"
            ? "The invitation was sent."
            : deliveryStatus === "CANCELLED"
              ? "Copy and share the link below. It works once and only for this email address."
              : "Email delivery will retry automatically. You can also copy the link below."}
        </InlineAlert>
      ) : null}

      {inviteUrl ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-white">One-time invitation</p>
            {expiresAt ? <span className="text-xs text-zinc-500">Expires {formatDateTime(expiresAt, preferences)}</span> : null}
          </div>
          <label htmlFor="generated-invite-url" className="sr-only">Generated invitation link</label>
          <input id="generated-invite-url" readOnly value={inviteUrl} onFocus={(event: FocusEvent<HTMLInputElement>) => event.currentTarget.select()} className="mt-3 min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 font-mono text-xs text-zinc-300" />
          <button type="button" onClick={() => void handleCopyExisting()} className="mt-3 min-h-10 w-full rounded-lg border border-white/10 text-xs font-bold text-zinc-200 hover:bg-white/5">Copy link</button>
        </div>
      ) : null}
    </Dialog>
  );
}
