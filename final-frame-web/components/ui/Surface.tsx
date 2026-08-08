import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
  elevated?: boolean;
  interactive?: boolean;
}

export default function Surface({
  as: Component = "div",
  children,
  elevated = false,
  interactive = false,
  className,
  ...props
}: SurfaceProps) {
  return (
    <Component
      className={cn(
        "rounded-[var(--radius-xl)] border bg-[var(--surface)]",
        elevated
          ? "border-[var(--border-strong)] shadow-[var(--shadow-md)]"
          : "border-[var(--border)] shadow-[var(--shadow-sm)]",
        interactive &&
          "transition-[background-color,border-color,box-shadow] duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
