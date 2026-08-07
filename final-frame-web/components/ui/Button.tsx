import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "warning";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:bg-emerald-200",
  secondary:
    "border-white/12 bg-white/[0.045] text-white shadow-sm hover:border-white/20 hover:bg-white/[0.075] active:bg-white/10",
  ghost:
    "border-transparent bg-transparent text-zinc-300 hover:bg-white/[0.055] hover:text-white active:bg-white/10",
  danger:
    "border-rose-400/25 bg-rose-500/12 text-rose-100 hover:border-rose-300/40 hover:bg-rose-500/20 active:bg-rose-500/25",
  warning:
    "border-amber-300/25 bg-amber-400 text-amber-950 hover:bg-amber-300 active:bg-amber-200",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-10 rounded-lg px-3.5 text-sm",
  md: "min-h-11 rounded-xl px-4 text-sm",
  lg: "min-h-12 rounded-xl px-5 text-base",
  icon: "h-11 w-11 rounded-xl p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  loadingLabel = "Working…",
  leadingIcon,
  trailingIcon,
  children,
  className,
  disabled,
  type = "button",
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 border font-bold transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050607] disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.985]",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" label={loadingLabel} /> : leadingIcon}
      {loading ? loadingLabel : children}
      {!loading ? trailingIcon : null}
    </button>
  );
});

export default Button;
