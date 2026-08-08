import type { ReactNode } from "react";
import Surface from "@/components/ui/Surface";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export default function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <Surface className={`border-dashed text-center ${compact ? "px-5 py-8" : "px-6 py-12 sm:py-14"}`}>
      {icon ? (
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] text-xl text-[var(--text-muted)]"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <h3 className={`${icon ? "mt-4" : ""} text-lg font-semibold tracking-[-0.02em] text-[var(--text)]`}>
        {title}
      </h3>
      <div className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">{description}</div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Surface>
  );
}
