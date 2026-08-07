import Skeleton from "@/components/ui/Skeleton";

export default function DashboardSkeleton() {
  return (
    <div className="ff-project-grid" aria-label="Loading projects">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="ff-project-card ff-project-card-skeleton">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <Skeleton className="mt-8 h-6 w-2/3" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
          <div className="mt-auto flex items-center justify-between gap-4 pt-8">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
