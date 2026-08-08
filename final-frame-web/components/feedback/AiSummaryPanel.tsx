"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import WorkspaceIcon from "@/components/workspace/WorkspaceIcon";
import { generateAssetSummary } from "@/lib/api/assets";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";

interface AiSummaryPanelProps {
  projectId: string;
  assetId: string;
  commentCount: number;
}

interface PopoverPosition {
  top: number;
  right: number;
  width: number;
  maxHeight: number;
}

function SummaryContent({ value }: { value: string }) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="ff-ai-brief-content">
      {lines.map((line, index) => {
        const heading = line.match(/^#{1,3}\s+(.+)$/);
        if (heading) return <h4 key={index}>{heading[1]}</h4>;
        const checklist = line.match(/^[-*]\s+(?:\[[ xX]\]\s*)?(.+)$/);
        if (checklist) return <p key={index} className="ff-ai-brief-item"><span aria-hidden="true">✓</span><span>{checklist[1]}</span></p>;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

export default function AiSummaryPanel({ projectId, assetId, commentCount }: AiSummaryPanelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const sidebar = trigger.closest(".ff-workspace-feedback") as HTMLElement | null;
    const sidebarRect = sidebar?.getBoundingClientRect();
    const availableWidth = Math.max(220, (sidebarRect?.width ?? 280) - 16);
    const width = Math.min(264, availableWidth);
    const rightEdge = sidebarRect?.right ?? triggerRect.right;
    const top = triggerRect.bottom + 8;
    setPosition({
      top,
      right: Math.max(8, window.innerWidth - rightEdge + 8),
      width,
      maxHeight: Math.max(140, window.innerHeight - top - 12),
    });
  }, []);

  useEffect(() => {
    setSummary("");
    setError(null);
    setIsOpen(false);
    setPosition(null);
  }, [assetId]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, updatePosition]);

  async function generate() {
    if (isLoading || commentCount === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await generateAssetSummary(projectId, assetId);
      setSummary(response.summary);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setError({
        message: getUserFacingErrorMessage(caught, "The AI brief could not be generated."),
        requestId: normalized.requestId,
      });
    } finally {
      setIsLoading(false);
    }
  }

  function toggleBrief() {
    setIsOpen((current) => !current);
  }

  const cleanErrorMessage = error && /permission/i.test(error.message)
    ? "AI brief is not available for this project right now."
    : error?.message;

  const popoverStyle: CSSProperties | undefined = position
    ? { top: position.top, right: position.right, width: position.width, maxHeight: position.maxHeight }
    : undefined;

  const popover = isOpen && position && typeof document !== "undefined" ? createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="AI feedback brief"
      className="ff-ai-brief-popover"
      style={popoverStyle}
    >
      <div className="ff-ai-brief-head">
        <div>
          <h3>AI brief</h3>
          <p>{commentCount} comment{commentCount === 1 ? "" : "s"}</p>
        </div>
        <button type="button" className="ff-ai-brief-close" onClick={() => setIsOpen(false)} aria-label="Close AI brief">×</button>
      </div>

      {isLoading && !summary ? (
        <div className="ff-ai-brief-loading" role="status"><span aria-hidden="true" />Summarizing…</div>
      ) : summary ? (
        <SummaryContent value={summary} />
      ) : error ? (
        <div className="ff-ai-brief-error" role="alert">
          <strong>Brief unavailable</strong>
          <p>{cleanErrorMessage}</p>
          {error.requestId ? (
            <details>
              <summary>Support reference</summary>
              <code>{error.requestId}</code>
            </details>
          ) : null}
        </div>
      ) : (
        <div className="ff-ai-brief-empty">
          <strong>Summarize the feedback</strong>
          <p>Turn the current comments into a short checklist.</p>
        </div>
      )}

      <div className="ff-ai-brief-footer">
        <span>{summary ? "Review against the comments." : "AI-generated"}</span>
        <button type="button" onClick={() => void generate()} disabled={isLoading || commentCount === 0}>
          {isLoading ? "Working…" : summary ? "Refresh" : error ? "Try again" : "Generate"}
        </button>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={rootRef} className="ff-ai-brief">
      <button
        ref={triggerRef}
        type="button"
        className={`ff-ai-brief-trigger ${isOpen ? "is-active" : ""} ${isLoading ? "is-loading" : ""}`}
        onClick={toggleBrief}
        disabled={commentCount === 0}
        aria-label="AI feedback brief"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-tooltip="Summarize feedback"
      >
        <WorkspaceIcon name="sparkles" />
        <span>AI brief</span>
      </button>
      {popover}
    </div>
  );
}
