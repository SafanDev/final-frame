"use client";

import { useEffect, useState } from "react";
import InviteJoinClient from "@/components/invitations/InviteJoinClient";
import Skeleton from "@/components/ui/Skeleton";
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

    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }

    setToken(fragmentToken ?? storedToken);
  }, []);

  if (token === undefined) {
    return (
      <main className="ff-invite-page" role="status" aria-live="polite">
        <section className="ff-invite-card is-loading">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-5 h-8 w-52 max-w-full" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
          <Skeleton className="mt-8 h-11 w-full" />
        </section>
      </main>
    );
  }

  return <InviteJoinClient token={token ?? ""} tokenIsValid={token !== null} />;
}
