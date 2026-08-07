import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { ButtonSize, ButtonVariant } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-emerald-400 text-emerald-950 hover:bg-emerald-300",
  secondary: "border-white/12 bg-white/[0.045] text-white hover:border-white/20 hover:bg-white/[0.075]",
  ghost: "border-transparent bg-transparent text-zinc-300 hover:bg-white/[0.055] hover:text-white",
  danger: "border-rose-400/25 bg-rose-500/12 text-rose-100 hover:bg-rose-500/20",
  warning: "border-amber-300/25 bg-amber-400 text-amber-950 hover:bg-amber-300",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-10 rounded-lg px-3.5 text-sm",
  md: "min-h-11 rounded-xl px-4 text-sm",
  lg: "min-h-12 rounded-xl px-5 text-base",
  icon: "h-11 w-11 rounded-xl p-0",
};

interface LinkButtonProps extends LinkProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function LinkButton({ children, variant = "secondary", size = "md", className, ...props }: LinkButtonProps) {
  return (
    <Link
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 border font-bold transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050607] motion-safe:hover:-translate-y-px",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
