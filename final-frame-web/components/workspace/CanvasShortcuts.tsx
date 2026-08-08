"use client";

interface CanvasShortcutsProps {
  onClose: () => void;
}

const shortcuts = [
  ["Click", "Add pin"],
  ["P", "Add keyboard pin"],
  ["Shift + wheel", "Zoom"],
  ["Space + drag", "Pan"],
  ["Alt + ←/→", "Change file"],
  ["Esc", "Cancel"],
] as const;

export default function CanvasShortcuts({ onClose }: CanvasShortcutsProps) {
  return (
    <div className="ff-canvas-shortcuts" data-pin-ignore="true">
      <div className="ff-canvas-shortcuts-head">
        <p>Shortcuts</p>
        <button type="button" onClick={onClose} aria-label="Close shortcuts">×</button>
      </div>
      <dl>
        {shortcuts.map(([key, action]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
