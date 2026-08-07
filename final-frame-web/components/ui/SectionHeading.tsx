import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SectionHeadingProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: "h1" | "h2";
  id?: string;
  className?: string;
}

export default function SectionHeading({ eyebrow, title, description, actions, as: Heading = "h2", id, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-col justify-between gap-5 md:flex-row md:items-end", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-300">{eyebrow}</p> : null}
        <Heading id={id} className={`${eyebrow ? "mt-3" : ""} text-balance text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl`}>
          {title}
        </Heading>
        {description ? <div className="mt-3 max-w-3xl text-pretty text-base leading-7 text-zinc-400">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
