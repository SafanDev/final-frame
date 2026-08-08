import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <main className="ff-container ff-route-loading" role="status" aria-live="polite" aria-label="Loading FinalFrame">
      <div className="ff-route-loading-label">
        <Spinner className="h-4 w-4 text-[var(--accent)]" label="Loading FinalFrame" />
        <span>Loading…</span>
      </div>
      <div className="ff-route-loading-lines" aria-hidden="true">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-[min(28rem,82vw)]" />
        <Skeleton className="h-3 w-[min(38rem,88vw)]" />
        <Skeleton className="h-3 w-[min(31rem,72vw)]" />
      </div>
    </main>
  );
}
