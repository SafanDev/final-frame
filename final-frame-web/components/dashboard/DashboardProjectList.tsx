import type { MouseEvent } from "react";
import type { ProjectListItem, ProjectPage } from "@/lib/api/types";
import type { ApiError } from "@/lib/api/errors";
import { getUserFacingErrorMessage } from "@/lib/api/errors";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import ProjectCard from "@/components/dashboard/ProjectCard";

interface DashboardProjectListProps {
  isLoading: boolean;
  loadError: ApiError | null;
  projects: ProjectListItem[];
  stats: ProjectPage["stats"];
  currentUserId: string;
  onRetry: () => void;
  onCreate: (event: MouseEvent<HTMLButtonElement>) => void;
  onResetFilters: () => void;
  onEdit: (project: ProjectListItem) => void;
  onToggleArchive: (project: ProjectListItem) => void;
  onDelete: (project: ProjectListItem) => void;
}

export default function DashboardProjectList({
  isLoading,
  loadError,
  projects,
  stats,
  currentUserId,
  onRetry,
  onCreate,
  onResetFilters,
  onEdit,
  onToggleArchive,
  onDelete,
}: DashboardProjectListProps) {
  if (isLoading) return <DashboardSkeleton />;

  if (loadError) {
    return (
      <EmptyState
        icon="!"
        title="Projects could not be loaded"
        description={
          <>
            <p>{getUserFacingErrorMessage(loadError)}</p>
            {loadError.requestId ? (
              <p className="mt-2 break-all font-mono text-xs text-[var(--text-subtle)]">
                Reference: {loadError.requestId}
              </p>
            ) : null}
          </>
        }
        action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}
      />
    );
  }

  if (!projects.length) {
    return (
      <EmptyState
        icon="◇"
        title={stats.total === 0 ? "No projects yet" : "No matches"}
        description={stats.total === 0
          ? "Create your first project when you are ready."
          : "Try a different search or clear the filters."}
        action={stats.total === 0
          ? <Button variant="primary" onClick={onCreate}>Create project</Button>
          : <Button variant="secondary" onClick={onResetFilters}>Clear filters</Button>}
      />
    );
  }

  return (
    <div className="ff-project-grid">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onToggleArchive={onToggleArchive}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
