import Skeleton from "@/components/ui/Skeleton";

export default function ProjectLoading() {
  return (
    <div className="ff-project-loading" role="status" aria-live="polite" aria-label="Opening workspace">
      <div className="ff-project-loading-head">
        <Skeleton className="h-9 w-9" />
        <div className="min-w-0 flex-1"><Skeleton className="h-4 w-44" /><Skeleton className="mt-2 h-3 w-28" /></div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="ff-project-loading-grid" aria-hidden="true">
        <Skeleton className="ff-project-loading-panel" />
        <Skeleton className="ff-project-loading-stage" />
        <Skeleton className="ff-project-loading-panel is-right" />
      </div>
    </div>
  );
}
