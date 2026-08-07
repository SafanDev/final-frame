"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { sessionExpiredEventName } from "@/lib/api/client";

export default function SessionExpiryListener() {
  const handlingExpiry = useRef(false);

  useEffect(() => {
    const handleSessionExpired = async () => {
      if (handlingExpiry.current) return;
      handlingExpiry.current = true;

      const currentPath = `${window.location.pathname}${window.location.search}`;
      const callbackUrl = currentPath.startsWith("/login")
        ? "/app"
        : currentPath;

      await signOut({ redirect: false });
      const parameters = new URLSearchParams({
        callbackUrl,
        reason: "session-expired",
      });
      window.location.assign(`/login?${parameters.toString()}`);
    };

    window.addEventListener(sessionExpiredEventName, handleSessionExpired);
    return () => {
      window.removeEventListener(sessionExpiredEventName, handleSessionExpired);
    };
  }, []);

  return null;
}
