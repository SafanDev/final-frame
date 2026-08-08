import type { ProjectPage } from "@/lib/api/types";
import type { StatusFilter } from "@/components/dashboard/dashboardTypes";
import { cn } from "@/lib/utils/cn";

interface DashboardStatsProps {
  stats: ProjectPage["stats"];
  activeStatus: StatusFilter;
  onSelect: (status: StatusFilter) => void;
}

const items = [
  { label: "All", key: "total", status: "ALL" },
  { label: "Review", key: "inReview", status: "IN_REVIEW" },
  { label: "Changes", key: "changesRequested", status: "CHANGES_REQUESTED" },
  { label: "Approved", key: "approved", status: "APPROVED" },
] as const;

export default function DashboardStats({ stats, activeStatus, onSelect }: DashboardStatsProps) {
  return (
    <div className="ff-dashboard-stats" aria-label="Filter projects by status">
      {items.map((item) => {
        const active = activeStatus === item.status;
        return (
          <button
            key={item.status}
            type="button"
            aria-pressed={active}
            className={cn("ff-dashboard-stat", active && "is-active")}
            onClick={() => onSelect(item.status)}
          >
            <span>{item.label}</span>
            <strong>{stats[item.key]}</strong>
          </button>
        );
      })}
    </div>
  );
}
