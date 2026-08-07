"use client";

import { useEffect, useState } from "react";
import InviteJoinClient from "@/components/invitations/InviteJoinClient";
import {
  INVITATION_TOKEN_STORAGE_KEY,
  normalizeInvitationToken,
} from "@/lib/invitations/token-storage";

export default function InviteTokenBridge() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let fragmentToken: string | null = null;
    try {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      fragmentToken = normalizeInvitationToken(fragment.get("token"));
    } catch {
      fragmentToken = null;
    }

    let storedToken: string | null = null;
    try {
      storedToken = normalizeInvitationToken(window.sessionStorage.getItem(INVITATION_TOKEN_STORAGE_KEY));
      if (fragmentToken) window.sessionStorage.setItem(INVITATION_TOKEN_STORAGE_KEY, fragmentToken);
      else if (!storedToken) window.sessionStorage.removeItem(INVITATION_TOKEN_STORAGE_KEY);
    } catch {
      storedToken = null;
    }

    // Fragments are not sent to the server, but removing the secret immediately
    // also keeps it out of copied addresses, screenshots and browser history.
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }

    setToken(fragmentToken ?? storedToken);
  }, []);

  if (token === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4" role="status" aria-live="polite">
        <p className="text-sm font-medium text-zinc-400">Preparing the secure invitation…</p>
      </div>
    );
  }

  return <InviteJoinClient token={token ?? ""} tokenIsValid={token !== null} />;
}
