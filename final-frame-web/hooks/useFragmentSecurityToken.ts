"use client";

import { useEffect, useState } from "react";

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

/** Captures a one-time security token from the URL fragment and removes it immediately. */
export function useFragmentSecurityToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let candidate: string | null = null;
    try {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const value = fragment.get("token")?.trim().toLowerCase() ?? "";
      candidate = TOKEN_PATTERN.test(value) ? value : null;
    } catch {
      candidate = null;
    }

    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    setToken(candidate);
  }, []);

  return token;
}
