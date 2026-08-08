import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils/cn";

interface WorkspaceControlRowProps {
  title: string;
  description?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "success" | "warning" | "danger";
  actionRef?: Ref<HTMLButtonElement>;
  trailing?: ReactNode;
}

export default function WorkspaceControlRow({
  title,
  description,
  icon,
  onClick,
  disabled,
  tone = "neutral",
  actionRef,
  trailing,
}: WorkspaceControlRowProps) {
  return (
    <button
      ref={actionRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "ff-workspace-control-row",
        tone !== "neutral" && `is-${tone}`,
      )}
    >
      <span className="ff-workspace-control-icon">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="ff-workspace-control-title">{title}</span>
        {description ? <span className="ff-workspace-control-copy">{description}</span> : null}
      </span>
      {trailing ?? <span className="ff-workspace-control-arrow" aria-hidden="true">→</span>}
    </button>
  );
}
