"use client";

import Link from "next/link";
import type { ProjectListItem } from "@/lib/api/types";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import ProjectActionsMenu from "@/components/dashboard/ProjectActionsMenu";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { formatRelativeDate, formatShortDate, statusLabel } from "@/lib/utils/format";

interface ProjectCardProps {
  project: ProjectListItem;
  currentUserId: string;
  onEdit: (project: ProjectListItem) => void;
  onToggleArchive: (project: ProjectListItem) => void;
  onDelete: (project: ProjectListItem) => void;
}

const statusTone: Record<ProjectListItem["status"], BadgeTone> = {
  DRAFT: "neutral",
  IN_REVIEW: "info",
  CHANGES_REQUESTED: "warning",
  APPROVED: "success",
};

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h13" />
      <path d="m14 8 4 4-4 4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4.6" />
    </svg>
  );
}

export default function ProjectCard({
  project,
  currentUserId,
  onEdit,
  onToggleArchive,
  onDelete,
}: ProjectCardProps) {
  const preferences = useUserPreferences();
  const isOwner = project.ownerId === currentUserId;
  const canEditDetails = !project.isArchived && (
    project.status === "DRAFT" || project.status === "CHANGES_REQUESTED"
  );
  const canArchive = project.status !== "IN_REVIEW";

  return (
    <article className="ff-project-card">
      <div className="ff-project-card-top">
        <div className="ff-project-card-badges">
          <Badge tone={statusTone[project.status]}>{statusLabel(project.status)}</Badge>
          {project.isArchived ? <Badge>Archived</Badge> : null}
        </div>
        {isOwner ? (
          <ProjectActionsMenu
            project={project}
            canEditDetails={canEditDetails}
            canArchive={canArchive}
            onEdit={() => onEdit(project)}
            onToggleArchive={() => onToggleArchive(project)}
            onDelete={() => onDelete(project)}
          />
        ) : null}
      </div>

      <div className="ff-project-card-body">
        <p className="ff-project-card-owner">{isOwner ? "Created by you" : "Shared with you"}</p>
        <h3>
          <Link href={`/project/${project.id}`}>{project.title}</Link>
        </h3>
        <p className="ff-project-card-description">{project.description || "No description yet."}</p>
      </div>

      <div className="ff-project-card-meta" aria-label="Project details">
        <span><FileIcon /> {project._count.assets} {project._count.assets === 1 ? "file" : "files"}</span>
        <span><PeopleIcon /> {project._count.members} {project._count.members === 1 ? "person" : "people"}</span>
      </div>

      <footer className="ff-project-card-footer">
        <time
          dateTime={new Date(project.updatedAt).toISOString()}
          title={formatShortDate(project.updatedAt, preferences)}
        >
          Updated {formatRelativeDate(project.updatedAt, preferences)}
        </time>
        <Link href={`/project/${project.id}`} className="ff-project-open">
          Open review <ArrowIcon />
        </Link>
      </footer>
    </article>
  );
}
