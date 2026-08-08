import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export default function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-[var(--radius-md)] bg-white/[0.055]", className)}
      {...props}
    />
  );
}
