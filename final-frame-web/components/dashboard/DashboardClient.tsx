"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CursorPageQuery, PageInfo, ProjectListItem, ProjectPage } from "@/lib/api/types";
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  listProjects,
  updateProject as apiUpdateProject,
} from "@/lib/api/projects";
import {
  getUserFacingErrorMessage,
  normalizeApiError,
  type ApiError,
} from "@/lib/api/errors";
import { emptyPageInfo, mergePageItems } from "@/lib/api/pagination";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardProjectList from "@/components/dashboard/DashboardProjectList";
import DashboardStats from "@/components/dashboard/DashboardStats";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DeleteProjectDialog from "@/components/dashboard/DeleteProjectDialog";
import ProjectFormDialog, { type ProjectFormValues } from "@/components/dashboard/ProjectFormDialog";
import type {
  LifecycleFilter,
  OwnershipFilter,
  ProjectFormMode,
  SortOption,
  StatusFilter,
} from "@/components/dashboard/dashboardTypes";
import { sortQuery } from "@/components/dashboard/dashboardTypes";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";

interface DashboardClientProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
  };
}

const PAGE_SIZE = 50;

const emptyStats: ProjectPage["stats"] = {
  matching: 0,
  total: 0,
  owned: 0,
  shared: 0,
  draft: 0,
  inReview: 0,
  changesRequested: 0,
  approved: 0,
};

export default function DashboardClient({ currentUser }: DashboardClientProps) {
  const router = useRouter();
  const loadSequenceRef = useRef(0);
  const projectFormReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>(emptyPageInfo);
  const [stats, setStats] = useState<ProjectPage["stats"]>(emptyStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<ApiError | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("ACTIVE");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortOption>("UPDATED_DESC");
  const [showFilters, setShowFilters] = useState(false);

  const [projectFormMode, setProjectFormMode] = useState<ProjectFormMode>("closed");
  const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectListItem | null>(null);

  const projectQuery = useMemo<CursorPageQuery>(() => ({
    limit: PAGE_SIZE,
    ...(deferredSearch ? { q: deferredSearch } : {}),
    ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
    archived: lifecycleFilter === "ALL" ? "all" : lifecycleFilter === "ARCHIVED" ? "true" : "false",
    scope: ownershipFilter === "OWNED" ? "owned" : ownershipFilter === "SHARED" ? "shared" : "all",
    sort: sortQuery[sort],
  }), [deferredSearch, lifecycleFilter, ownershipFilter, sort, statusFilter]);

  const fetchFirstPage = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequenceRef.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const page = await listProjects(projectQuery, signal);
      if (sequence !== loadSequenceRef.current) return;
      setProjects(page.items);
      setPageInfo(page.pageInfo);
      setStats(page.stats);
    } catch (error) {
      const normalized = normalizeApiError(error);
      if (normalized.kind !== "aborted" && sequence === loadSequenceRef.current) {
        setLoadError(normalized);
      }
    } finally {
      if (sequence === loadSequenceRef.current) setIsLoading(false);
    }
  }, [projectQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchFirstPage(controller.signal);
    return () => controller.abort();
  }, [fetchFirstPage]);

  async function loadMore() {
    if (!pageInfo.hasMore || !pageInfo.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setNotice(null);

    try {
      const page = await listProjects({ ...projectQuery, cursor: pageInfo.nextCursor });
      setProjects((current) => mergePageItems(current, page.items));
      setPageInfo(page.pageInfo);
      setStats(page.stats);
    } catch (error) {
      const normalized = normalizeApiError(error);
      setNotice(normalized);
      toast.error(getUserFacingErrorMessage(normalized));
    } finally {
      setIsLoadingMore(false);
    }
  }

  function replaceProject(updated: ProjectListItem) {
    setProjects((current) => current.map((project) => project.id === updated.id ? updated : project));
  }

  async function handleCreate(values: ProjectFormValues) {
    const created = await apiCreateProject(values);
    setProjects((current) => [created, ...current.filter((project) => project.id !== created.id)]);
    toast.success("Project created. Opening the workspace…");
    router.push(`/project/${created.id}`);
  }

  async function handleEdit(values: ProjectFormValues) {
    if (!editingProject) return;
    setBusyProjectId(editingProject.id);
    try {
      const updated = await apiUpdateProject(editingProject.id, {
        title: values.title,
        description: values.description ?? null,
        expectedVersion: editingProject.version,
      });
      replaceProject(updated);
      toast.success("Project details updated.");
    } catch (error) {
      const normalized = normalizeApiError(error);
      if (normalized.code === "CONFLICT" || normalized.code === "TRANSACTION_CONFLICT") {
        await fetchFirstPage();
      }
      throw normalized;
    } finally {
      setBusyProjectId(null);
    }
  }

  async function handleToggleArchive(project: ProjectListItem) {
    if (busyProjectId || project.status === "IN_REVIEW") return;
    setBusyProjectId(project.id);
    setNotice(null);

    try {
      const updated = await apiUpdateProject(project.id, {
        isArchived: !project.isArchived,
        expectedVersion: project.version,
      });
      replaceProject(updated);
      toast.success(project.isArchived ? "Project reopened." : "Project archived.");
      await fetchFirstPage();
    } catch (error) {
      const normalized = normalizeApiError(error);
      setNotice(normalized);
      if (normalized.code === "CONFLICT" || normalized.code === "TRANSACTION_CONFLICT") {
        await fetchFirstPage();
      }
      toast.error(getUserFacingErrorMessage(normalized));
    } finally {
      setBusyProjectId(null);
    }
  }

  async function handleDelete(project: ProjectListItem) {
    setBusyProjectId(project.id);
    try {
      await apiDeleteProject(project.id, project.version);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      toast.success("Project deleted and storage cleanup queued.");
      await fetchFirstPage();
    } finally {
      setBusyProjectId(null);
    }
  }

  function openCreateDialog(event: ReactMouseEvent<HTMLButtonElement>) {
    projectFormReturnFocusRef.current = event.currentTarget;
    setEditingProject(null);
    setProjectFormMode("create");
  }

  function openEditDialog(project: ProjectListItem) {
    setEditingProject(project);
    setProjectFormMode("edit");
  }

  function closeProjectDialog() {
    if (busyProjectId) return;
    setProjectFormMode("closed");
    setEditingProject(null);
  }

  const filtersAreActive = Boolean(search.trim()) ||
    ownershipFilter !== "ALL" ||
    lifecycleFilter !== "ACTIVE" ||
    statusFilter !== "ALL" ||
    sort !== "UPDATED_DESC";

  function resetFilters() {
    setSearch("");
    setOwnershipFilter("ALL");
    setLifecycleFilter("ACTIVE");
    setStatusFilter("ALL");
    setSort("UPDATED_DESC");
  }

  function selectStatus(status: StatusFilter) {
    setLifecycleFilter("ALL");
    setStatusFilter(status);
  }

  return (
    <div className="ff-container ff-dashboard-page">
      <DashboardHeader
        firstName={currentUser.name.split(" ")[0] || "there"}
        onCreate={openCreateDialog}
      />

      <DashboardStats stats={stats} activeStatus={statusFilter} onSelect={selectStatus} />

      <section className="ff-dashboard-projects" aria-labelledby="projects-heading">
        <DashboardToolbar
          matching={stats.matching}
          search={search}
          sort={sort}
          ownershipFilter={ownershipFilter}
          lifecycleFilter={lifecycleFilter}
          statusFilter={statusFilter}
          showFilters={showFilters}
          filtersAreActive={filtersAreActive}
          onSearchChange={setSearch}
          onSortChange={setSort}
          onOwnershipChange={setOwnershipFilter}
          onLifecycleChange={setLifecycleFilter}
          onStatusChange={setStatusFilter}
          onToggleFilters={() => setShowFilters((current) => !current)}
          onReset={resetFilters}
        />

        {notice ? (
          <InlineAlert
            tone="error"
            title="A project action could not be completed"
            requestId={notice.requestId}
            className="mt-5"
          >
            {getUserFacingErrorMessage(notice)}
          </InlineAlert>
        ) : null}

        <div className="ff-dashboard-results" aria-live="polite" aria-busy={isLoading}>
          <DashboardProjectList
            isLoading={isLoading}
            loadError={loadError}
            projects={projects}
            stats={stats}
            currentUserId={currentUser.id}
            onRetry={() => void fetchFirstPage()}
            onCreate={openCreateDialog}
            onResetFilters={resetFilters}
            onEdit={openEditDialog}
            onToggleArchive={(project) => void handleToggleArchive(project)}
            onDelete={setDeletingProject}
          />
        </div>

        {pageInfo.hasMore ? (
          <div className="ff-dashboard-load-more">
            <Button
              variant="secondary"
              onClick={() => void loadMore()}
              loading={isLoadingMore}
              loadingLabel="Loading…"
            >
              Load more
            </Button>
          </div>
        ) : null}
      </section>

      <ProjectFormDialog
        open={projectFormMode !== "closed"}
        project={projectFormMode === "edit" ? editingProject : null}
        returnFocusRef={projectFormMode === "create" ? projectFormReturnFocusRef : undefined}
        onClose={closeProjectDialog}
        onSubmit={projectFormMode === "edit" ? handleEdit : handleCreate}
      />
      <DeleteProjectDialog
        project={deletingProject}
        onClose={() => { if (!busyProjectId) setDeletingProject(null); }}
        onConfirm={handleDelete}
      />
    </div>
  );
}
