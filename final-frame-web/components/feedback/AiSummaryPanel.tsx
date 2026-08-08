"use client";

import { useEffect, useState } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import { generateAssetSummary } from "@/lib/api/assets";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";

interface AiSummaryPanelProps {
  projectId: string;
  assetId: string;
  commentCount: number;
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
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  useEffect(() => {
    setSummary("");
    setError(null);
  }, [assetId]);

  async function generate() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await generateAssetSummary(projectId, assetId);
      setSummary(response.summary);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setError({
        message: getUserFacingErrorMessage(caught, "The feedback summary could not be generated."),
        requestId: normalized.requestId,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section aria-labelledby="ai-summary-title" className={`ff-ai-brief ${summary ? "is-open" : ""}`}>
      <div className="ff-ai-brief-head">
        <div className="min-w-0">
          <h3 id="ai-summary-title">Feedback brief</h3>
          <p>Turn the current comments into a short checklist.</p>
        </div>
        <button type="button" onClick={() => void generate()} disabled={isLoading || commentCount === 0}>
          {isLoading ? "Working…" : summary ? "Refresh" : "Summarize"}
        </button>
      </div>

      {summary ? <SummaryContent value={summary} /> : null}
      {error ? <InlineAlert tone="error" title="Summary unavailable" requestId={error.requestId} className="mt-3">{error.message}</InlineAlert> : null}
    </section>
  );
}
