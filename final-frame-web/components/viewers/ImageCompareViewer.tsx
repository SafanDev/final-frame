"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import InlineAlert from "@/components/ui/InlineAlert";
import { useSecureAssetUrl } from "@/hooks/useSecureAssetUrl";
import type { ProjectAsset } from "@/lib/api/types";

interface ImageCompareViewerProps {
  base: ProjectAsset;
  target: ProjectAsset;
}

export default function ImageCompareViewer({ base, target }: ImageCompareViewerProps) {
  const [position, setPosition] = useState(50);
  const baseUrl = useSecureAssetUrl(base.id);
  const targetUrl = useSecureAssetUrl(target.id);

  useEffect(() => setPosition(50), [base.id, target.id]);

  if (baseUrl.error || targetUrl.error) {
    return (
      <InlineAlert tone="error" title="Version comparison unavailable" className="max-w-xl">
        {baseUrl.error || targetUrl.error}
        <button type="button" onClick={() => void Promise.all([baseUrl.refresh(), targetUrl.refresh()])} className="mt-2 min-h-9 rounded-lg border border-current/25 px-3 text-xs font-bold hover:bg-white/5">Refresh previews</button>
      </InlineAlert>
    );
  }

  if (!baseUrl.url || !targetUrl.url) {
    return <p role="status" className="text-sm text-zinc-400">Preparing secure version comparison…</p>;
  }

  return (
    <div className="flex w-full max-w-[92vw] flex-col items-center gap-4">
      <div className="relative max-h-[76vh] max-w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={targetUrl.url} alt={`${target.fileName}, version ${target.version}`} className="block max-h-[76vh] max-w-[92vw] object-contain" onError={() => void targetUrl.refresh()} />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={baseUrl.url} alt={`${base.fileName}, version ${base.version}`} className="h-full w-full object-contain" onError={() => void baseUrl.refresh()} />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.8)]" style={{ left: `${position}%` }} aria-hidden="true" />
        <span className="absolute left-3 top-3 rounded-lg bg-black/75 px-2 py-1 text-xs font-bold text-white">v{base.version}</span>
        <span className="absolute right-3 top-3 rounded-lg bg-black/75 px-2 py-1 text-xs font-bold text-white">v{target.version}</span>
      </div>
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#080808]/95 p-4">
        <label htmlFor="image-compare-position" className="flex items-center justify-between text-xs font-semibold text-zinc-300"><span>Comparison divider</span><span>{position}%</span></label>
        <input id="image-compare-position" type="range" min={0} max={100} value={position} onChange={(event: ChangeEvent<HTMLInputElement>) => setPosition(Number(event.target.value))} className="mt-3 w-full accent-emerald-400" />
        <p className="mt-2 text-xs leading-5 text-zinc-500">Use the arrow keys while the slider is focused for precise comparison.</p>
      </div>
    </div>
  );
}
