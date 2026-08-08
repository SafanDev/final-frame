import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "warning";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-strong)]",
  secondary:
    "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)] hover:border-[var(--border-emphasis)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)]",
  ghost:
    "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-white/[0.055] hover:text-[var(--text)] active:bg-white/[0.08]",
  danger:
    "border-rose-300/22 bg-rose-400/10 text-rose-100 hover:border-rose-300/35 hover:bg-rose-400/16 active:bg-rose-400/22",
  warning:
    "border-amber-200/20 bg-[var(--warning)] text-[#2b1b02] hover:brightness-105 active:brightness-95",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-10 rounded-[var(--radius-md)] px-3.5 text-sm",
  md: "min-h-11 rounded-[var(--radius-md)] px-4 text-sm",
  lg: "min-h-12 rounded-[var(--radius-lg)] px-5 text-base",
  icon: "h-11 w-11 rounded-[var(--radius-md)] p-0",
};

const baseClass =
  "inline-flex shrink-0 items-center justify-center gap-2 border font-semibold tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.985]";

export function getButtonClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
) {
  return cn(baseClass, variantClasses[variant], sizeClasses[size], className);
}
