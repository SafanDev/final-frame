import { cn } from "@/lib/utils/cn";

interface SpinnerProps {
  className?: string;
  label?: string;
}

export default function Spinner({ className, label = "Loading" }: SpinnerProps) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current",
          className,
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
