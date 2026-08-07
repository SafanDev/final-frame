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
    <div className="space-y-2 text-sm leading-6 text-zinc-200">
      {lines.map((line, index) => {
        const heading = line.match(/^#{1,3}\s+(.+)$/);
        if (heading) return <h4 key={index} className="pt-2 font-bold text-white">{heading[1]}</h4>;
        const checklist = line.match(/^[-*]\s+(?:\[[ xX]\]\s*)?(.+)$/);
        if (checklist) return <p key={index} className="flex gap-2"><span className="mt-0.5 text-emerald-300" aria-hidden="true">✓</span><span>{checklist[1]}</span></p>;
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
    <section aria-labelledby="ai-summary-title" className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.07] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="ai-summary-title" className="text-sm font-bold text-violet-100">AI feedback brief</h3>
          <p className="mt-1 text-xs leading-5 text-violet-100/60">Groups written feedback into a concise checklist. Review it against the original comments.</p>
        </div>
        <span className="rounded-lg border border-violet-300/20 px-2 py-1 text-xs font-bold uppercase tracking-[0.12em] text-violet-200">Owner only</span>
      </div>

      {summary ? <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4"><SummaryContent value={summary} /></div> : null}
      {error ? <InlineAlert tone="error" title="Summary unavailable" requestId={error.requestId} className="mt-4">{error.message}</InlineAlert> : null}

      <button
        type="button"
        onClick={() => void generate()}
        disabled={isLoading || commentCount === 0}
        className="mt-4 min-h-10 w-full rounded-lg bg-violet-300 px-4 text-xs font-bold text-violet-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {isLoading ? "Generating brief…" : summary ? "Regenerate brief" : "Generate feedback brief"}
      </button>
    </section>
  );
}
