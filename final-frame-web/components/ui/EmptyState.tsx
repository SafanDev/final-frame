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
    <Surface className={`border-dashed text-center ${compact ? "px-5 py-8" : "px-6 py-14 sm:py-16"}`}>
      {icon ? (
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-2xl text-zinc-400" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className={`${icon ? "mt-5" : ""} text-xl font-bold tracking-tight text-white`}>{title}</h3>
      <div className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-400">{description}</div>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </Surface>
  );
}
