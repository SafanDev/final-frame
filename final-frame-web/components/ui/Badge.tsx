import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "success" | "info" | "warning" | "danger";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-white/12 bg-white/[0.045] text-zinc-300",
  success: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
  info: "border-sky-300/25 bg-sky-400/10 text-sky-200",
  warning: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  danger: "border-rose-300/25 bg-rose-400/10 text-rose-200",
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export default function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-bold leading-none", toneClasses[tone], className)}>
      {children}
    </span>
  );
}
