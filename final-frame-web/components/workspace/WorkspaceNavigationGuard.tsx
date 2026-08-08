"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import {
  getWorkspaceWorkflowBlockers,
  subscribeWorkspaceWorkflowSafety,
  type WorkspaceWorkflowBlocker,
} from "@/lib/workspace/workflow-safety";

function isPlainPrimaryClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export default function WorkspaceNavigationGuard() {
  const router = useRouter();
  const [blockers, setBlockers] = useState<WorkspaceWorkflowBlocker[]>([]);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setBlockers(getWorkspaceWorkflowBlockers());
    sync();
    return subscribeWorkspaceWorkflowSafety(sync);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (getWorkspaceWorkflowBlockers().length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (!isPlainPrimaryClick(event) || getWorkspaceWorkflowBlockers().length === 0) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;

      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const next = `${destination.pathname}${destination.search}${destination.hash}`;
      if (next === current) return;

      event.preventDefault();
      setPendingHref(next);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, []);

  const leave = () => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) router.push(href);
  };

  return (
    <Dialog
      open={Boolean(pendingHref)}
      onClose={() => setPendingHref(null)}
      title="Leave this workspace?"
      description="One action is still using this tab."
      role="alertdialog"
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={() => setPendingHref(null)}>Stay here</Button>
          <Button variant="danger" onClick={leave}>Leave anyway</Button>
        </>
      }
    >
      <ul className="ff-workspace-leave-list">
        {blockers.map((blocker) => <li key={blocker.id}>{blocker.message}</li>)}
      </ul>
      <p className="ff-workspace-leave-note">Written feedback drafts are saved in this tab automatically.</p>
    </Dialog>
  );
}
