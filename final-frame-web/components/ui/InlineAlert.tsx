import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type InlineAlertTone = "info" | "success" | "warning" | "error";

const toneClasses: Record<InlineAlertTone, string> = {
  info: "border-sky-300/25 bg-sky-400/10 text-sky-100",
  success: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  warning: "border-amber-300/25 bg-amber-400/10 text-amber-50",
  error: "border-rose-300/25 bg-rose-400/10 text-rose-100",
};

const icons: Record<InlineAlertTone, string> = {
  info: "i",
  success: "✓",
  warning: "!",
  error: "!",
};

interface InlineAlertProps {
  tone?: InlineAlertTone;
  title?: string;
  children: ReactNode;
  requestId?: string | null;
  className?: string;
  live?: "polite" | "assertive" | "off";
}

export default function InlineAlert({
  tone = "info",
  title,
  children,
  requestId,
  className,
  live = tone === "error" ? "assertive" : "polite",
}: InlineAlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={live}
      className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm leading-6", toneClasses[tone], className)}
    >
      <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/25 text-xs font-black">
        {icons[tone]}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold text-current">{title}</p> : null}
        <div className={`${title ? "mt-1 " : ""}text-current/90`}>{children}</div>
        {requestId ? (
          <p className="mt-2 break-all font-mono text-xs text-current/65">
            Support reference: {requestId}
          </p>
        ) : null}
      </div>
    </div>
  );
}
