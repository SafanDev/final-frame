import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div className="ff-container py-10" role="status" aria-live="polite" aria-label="Loading FinalFrame">
      <div className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
        <Spinner className="h-5 w-5 text-emerald-300" label="Loading FinalFrame" />
        Loading FinalFrame…
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]" aria-hidden="true">
        <Skeleton className="h-72 sm:h-96" />
        <div className="space-y-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    </div>
  );
}
