"use client";

import { type ChangeEvent, type Dispatch, type SetStateAction } from "react";

interface CanvasToolbarProps {
  scale: number;
  minScale: number;
  maxScale: number;
  zoomInput: string;
  setZoomInput: Dispatch<SetStateAction<string>>;
  commitZoomInput: () => void;
  updateScale: (next: number) => void;
  fitView: () => void;
  isCompareMode: boolean;
  canCompare: boolean;
  setIsCompareMode: (next: boolean) => void;
}

export default function CanvasToolbar({
  scale,
  minScale,
  maxScale,
  zoomInput,
  setZoomInput,
  commitZoomInput,
  updateScale,
  fitView,
  isCompareMode,
  canCompare,
  setIsCompareMode,
}: CanvasToolbarProps) {
  return (
    <div className="ff-canvas-toolbar" data-pin-ignore="true">
      <button type="button" onClick={() => updateScale(scale - 0.15)} disabled={isCompareMode} aria-label="Zoom out" title="Zoom out (-)">−</button>
      <label className="ff-canvas-zoom-input">
        <span className="sr-only">Zoom percentage</span>
        <input
          type="text"
          inputMode="numeric"
          value={zoomInput}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setZoomInput(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          onBlur={commitZoomInput}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              updateScale(scale + (event.key === "ArrowUp" ? 0.05 : -0.05));
            } else if (event.key === "Home") {
              event.preventDefault();
              updateScale(minScale);
            } else if (event.key === "End") {
              event.preventDefault();
              updateScale(maxScale);
            } else if (event.key === "Enter") {
              event.preventDefault();
              commitZoomInput();
              event.currentTarget.blur();
            }
          }}
          role="spinbutton"
          aria-valuemin={Math.round(minScale * 100)}
          aria-valuemax={Math.round(maxScale * 100)}
          aria-valuenow={Math.round(scale * 100)}
          disabled={isCompareMode}
        />
        <span aria-hidden="true">%</span>
      </label>
      <button type="button" onClick={() => updateScale(scale + 0.15)} disabled={isCompareMode} aria-label="Zoom in" title="Zoom in (+)">+</button>
      <span className="ff-canvas-toolbar-divider" aria-hidden="true" />
      <button type="button" onClick={fitView} disabled={isCompareMode} aria-label="Fit and reset view" title="Fit view (F or 0)" className="is-text">Fit</button>
      {canCompare ? (
        <button
          type="button"
          onClick={() => setIsCompareMode(!isCompareMode)}
          className={`is-text ${isCompareMode ? "is-active" : ""}`}
          aria-pressed={isCompareMode}
        >
          {isCompareMode ? "Done" : "Compare"}
        </button>
      ) : null}
    </div>
  );
}
