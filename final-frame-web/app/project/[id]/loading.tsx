import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";

export default function ProjectLoading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#050607] text-white" role="status" aria-live="polite" aria-label="Opening secure workspace">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Spinner className="h-5 w-5 text-emerald-300" label="Opening secure workspace" />
          <span className="text-sm font-semibold text-zinc-300">Opening secure workspace…</span>
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex min-h-0 flex-1 gap-px bg-white/10" aria-hidden="true">
        <Skeleton className="hidden h-full w-72 rounded-none bg-[#0b0c0e] md:block" />
        <div className="flex-1 bg-[#08090b] p-5 sm:p-8">
          <Skeleton className="h-full min-h-80 rounded-2xl" />
        </div>
        <Skeleton className="hidden h-full w-80 rounded-none bg-[#0b0c0e] xl:block" />
      </div>
    </div>
  );
}
