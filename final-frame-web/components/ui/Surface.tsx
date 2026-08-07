import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
  elevated?: boolean;
  interactive?: boolean;
}

export default function Surface({ as: Component = "div", children, elevated = false, interactive = false, className, ...props }: SurfaceProps) {
  return (
    <Component
      className={cn(
        "rounded-2xl border border-white/10 bg-[rgba(12,13,15,0.88)]",
        elevated ? "shadow-[0_16px_45px_rgba(0,0,0,0.24)]" : "shadow-[0_8px_24px_rgba(0,0,0,0.16)]",
        interactive && "transition duration-200 hover:border-white/18 hover:bg-[rgba(16,17,20,0.94)]",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
