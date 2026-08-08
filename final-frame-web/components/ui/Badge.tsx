import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "success" | "info" | "warning" | "danger";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-[var(--border-strong)] bg-white/[0.035] text-[var(--text-muted)]",
  success: "border-emerald-300/24 bg-emerald-300/10 text-emerald-100",
  info: "border-sky-300/24 bg-sky-300/10 text-sky-100",
  warning: "border-amber-300/24 bg-amber-300/10 text-amber-100",
  danger: "border-rose-300/24 bg-rose-300/10 text-rose-100",
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export default function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold leading-none tracking-[-0.005em]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
