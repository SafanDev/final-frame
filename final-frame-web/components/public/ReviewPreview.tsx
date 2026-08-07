"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils/cn";

const files = [
  {
    name: "Hero direction",
    version: "v4",
    kicker: "NORTH / 24",
    title: "Make the next frame matter.",
    variant: "hero",
  },
  {
    name: "Mobile frame",
    version: "v3",
    kicker: "MOBILE / 03",
    title: "Small screen. Same idea.",
    variant: "mobile",
  },
  {
    name: "Story crop",
    version: "v2",
    kicker: "STORY / 02",
    title: "Keep the story moving.",
    variant: "story",
  },
] as const;

const initialComments = [
  { marker: 1, author: "Trisha", copy: "Give the headline a little more air." },
  { marker: 2, author: "Nithya", copy: "This direction is ready to approve." },
] as const;

interface DemoPin {
  id: number;
  x: number;
  y: number;
}

const keyboardPin = { x: 66, y: 44 };

export default function ReviewPreview() {
  const [activeFile, setActiveFile] = useState(0);
  const [pins, setPins] = useState<DemoPin[]>([]);
  const [compare, setCompare] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [approved, setApproved] = useState(false);
  const [highlightedPin, setHighlightedPin] = useState<number | null>(null);
  const file = files[activeFile];

  const comments = useMemo(
    () => [
      ...initialComments,
      ...pins.map((pin) => ({
        marker: pin.id,
        author: "You",
        copy: "New feedback placed on this frame.",
      })),
    ],
    [pins],
  );

  function placePin(event: MouseEvent<HTMLButtonElement>) {
    const nextId = Math.min(6, pins.length + 3);
    if (pins.length >= 4) return;

    if (event.detail === 0) {
      setPins((current) => [...current, { id: nextId, ...keyboardPin }]);
      setHighlightedPin(nextId);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setPins((current) => [
      ...current,
      {
        id: nextId,
        x: Math.min(90, Math.max(10, x)),
        y: Math.min(88, Math.max(12, y)),
      },
    ]);
    setHighlightedPin(nextId);
  }

  function selectFile(index: number) {
    setActiveFile(index);
    setPins([]);
    setCompare(false);
    setApproved(false);
    setHighlightedPin(null);
  }

  return (
    <div className="ff-review-preview" aria-label="Interactive FinalFrame review preview">
      <div className="ff-review-preview-topbar">
        <div className="ff-preview-project">
          <span className="ff-live-dot" aria-hidden="true" />
          <div>
            <strong>Campaign launch</strong>
            <span>Review round 4</span>
          </div>
        </div>
        <span className={cn("ff-status-chip", approved && "is-approved")}>
          {approved ? "Approved" : "In review"}
        </span>
      </div>

      <div className="ff-review-preview-grid">
        <aside className="ff-review-files" aria-label="Preview files">
          <p className="ff-preview-section-label">Files</p>
          <div className="ff-preview-file-list">
            {files.map((item, index) => (
              <button
                type="button"
                key={item.name}
                onClick={() => selectFile(index)}
                className={cn("ff-preview-file", index === activeFile && "is-active")}
                aria-pressed={index === activeFile}
              >
                <span className={cn("ff-preview-file-thumb", `is-${item.variant}`)} aria-hidden="true" />
                <span className="ff-preview-file-copy">
                  <strong>{item.name}</strong>
                  <small>{item.version}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className={cn("ff-review-stage", zoomed && "is-zoomed")}>
          <div className={cn("ff-review-artboard", `is-${file.variant}`, compare && "is-comparing")}>
            <span className="ff-artboard-kicker">{file.kicker}</span>
            <h2>{file.title}</h2>
            <div className="ff-artboard-shapes" aria-hidden="true">
              <span />
              <span />
            </div>
            {compare ? (
              <div className="ff-artboard-compare" aria-hidden="true">
                <span>Previous</span>
              </div>
            ) : null}
            <span className={cn("ff-preview-pin pin-one", highlightedPin === 1 && "is-highlighted")} aria-hidden="true">1</span>
            <span className={cn("ff-preview-pin pin-two", highlightedPin === 2 && "is-highlighted")} aria-hidden="true">2</span>
            {pins.map((pin) => (
              <span
                key={pin.id}
                className={cn("ff-preview-pin pin-demo", highlightedPin === pin.id && "is-highlighted")}
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                aria-hidden="true"
              >
                {pin.id}
              </span>
            ))}
            <button
              type="button"
              className="ff-artboard-interaction"
              aria-label="Add a feedback pin to the preview"
              onClick={placePin}
            />
            <span className="ff-artboard-hint" aria-hidden="true">
              {pins.length >= 4 ? "Frame full" : "Click to pin"}
            </span>
          </div>

          <div className="ff-review-stage-tools" aria-label="Preview controls">
            <button type="button" onClick={() => setZoomed(false)} className={!zoomed ? "is-active" : undefined}>Fit</button>
            <button type="button" onClick={() => setZoomed((value) => !value)} className={zoomed ? "is-active" : undefined}>{zoomed ? "125%" : "100%"}</button>
            <button type="button" onClick={() => setCompare((value) => !value)} className={compare ? "is-active" : undefined}>Compare</button>
          </div>

          <span className="sr-only" aria-live="polite">
            {pins.length ? `${pins.length} demo feedback pin${pins.length === 1 ? "" : "s"} added.` : ""}
          </span>
        </div>

        <aside className="ff-review-feedback" aria-label="Preview feedback">
          <div className="ff-preview-feedback-head">
            <p className="ff-preview-section-label">Feedback</p>
            <span>{comments.length} open</span>
          </div>
          <div className="ff-preview-comment-list">
            {comments.map((comment) => (
              <button
                type="button"
                key={`${comment.marker}-${comment.author}`}
                className={cn("ff-preview-comment", comment.marker >= 3 && "is-new")}
                onClick={() => setHighlightedPin(comment.marker)}
              >
                <span>{String(comment.marker).padStart(2, "0")}</span>
                <div>
                  <strong>{comment.author}</strong>
                  <p>{comment.copy}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="ff-preview-approval">
            <span>Final decision</span>
            <strong>{approved ? "Decision recorded" : "Waiting for client"}</strong>
            <button type="button" onClick={() => setApproved((value) => !value)}>
              {approved ? "Undo demo" : "Approve frame"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
