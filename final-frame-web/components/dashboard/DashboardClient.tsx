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
import type { CursorPageQuery, ProjectListItem, ProjectPage, ProjectStatus } from "@/lib/api/types";
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
import type { PageInfo } from "@/lib/api/types";
import ProjectCard from "@/components/dashboard/ProjectCard";
import ProjectFormDialog, {
  type ProjectFormValues,
} from "@/components/dashboard/ProjectFormDialog";
import DeleteProjectDialog from "@/components/dashboard/DeleteProjectDialog";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";
import SelectMenu from "@/components/ui/SelectMenu";
import Skeleton from "@/components/ui/Skeleton";

interface DashboardClientProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
  };
}

type OwnershipFilter = "ALL" | "OWNED" | "SHARED";
type LifecycleFilter = "ACTIVE" | "ARCHIVED" | "ALL";
type StatusFilter = "ALL" | ProjectStatus;
type SortOption = "UPDATED_DESC" | "CREATED_DESC" | "TITLE_ASC";
type ProjectFormMode = "closed" | "create" | "edit";

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

const sortQuery: Readonly<Record<SortOption, NonNullable<CursorPageQuery["sort"]>>> = {
  UPDATED_DESC: "updated_desc",
  CREATED_DESC: "created_desc",
  TITLE_ASC: "title_asc",
};

function DashboardSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading projects">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="rounded-2xl border border-white/10 bg-[#0c0d0f]/90 p-6">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mt-6 h-7 w-3/4" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
          <div className="mt-10 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

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

  const visibleProjects = projects;

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

  return (
    <div className="ff-container ff-dashboard-page py-7 sm:py-10">
      <header className="ff-dashboard-hero" aria-labelledby="dashboard-title">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">Project desk</p>
            <h1 id="dashboard-title" className="mt-2 text-3xl font-black tracking-[-0.055em] text-white sm:text-5xl">Your work. One clear view.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">Welcome back, {currentUser.name.split(" ")[0]}. Pick up the next review and keep the work moving.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void fetchFirstPage()} loading={isLoading} loadingLabel="Refreshing…">Refresh</Button>
            <Button variant="primary" onClick={openCreateDialog}><span aria-hidden="true">＋</span> New project</Button>
          </div>
        </div>

        <div className="mt-7 grid gap-2 sm:grid-cols-3" aria-label="Review queue">
          {[
            { label: "In review", value: stats.inReview, status: "IN_REVIEW" as StatusFilter, note: "Ready for a decision" },
            { label: "Revision", value: stats.changesRequested, status: "CHANGES_REQUESTED" as StatusFilter, note: "Work is moving again" },
            { label: "Approved", value: stats.approved, status: "APPROVED" as StatusFilter, note: "Finished and locked" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => { setLifecycleFilter("ALL"); setStatusFilter(statusFilter === item.status ? "ALL" : item.status); }}
              aria-pressed={statusFilter === item.status}
              className={`group flex min-h-20 items-center justify-between rounded-xl border px-4 text-left transition ${statusFilter === item.status ? "border-emerald-300/50 bg-emerald-400/10" : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/[0.035]"}`}
            >
              <span><span className="block text-sm font-bold text-white">{item.label}</span><span className="mt-1 block text-xs text-zinc-500">{item.note}</span></span>
              <span className="font-mono text-2xl font-black text-zinc-200 tabular-nums">{item.value}</span>
            </button>
          ))}
        </div>
      </header>

      <section className="mt-8" aria-labelledby="projects-heading">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-zinc-600">Review desk</p>
            <h2 id="projects-heading" className="mt-1 text-2xl font-black tracking-[-0.035em] text-white">Your projects</h2>
            <p className="mt-1 text-sm text-zinc-500">{stats.matching} matching · {stats.owned} owned · {stats.shared} shared</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 sm:w-72">
              <label htmlFor="project-search" className="sr-only">Search projects</label>
              <input id="project-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" className={`${fieldControlClass} min-h-10 py-0`} />
            </div>
            <SelectMenu label="Sort projects" hideLabel value={sort} onChange={setSort} className="sm:w-48" buttonClassName="min-h-10" options={[
              { value: "UPDATED_DESC", label: "Recently updated" },
              { value: "CREATED_DESC", label: "Newest created" },
              { value: "TITLE_ASC", label: "Title A–Z" },
            ] as const} />
            <Button variant={showFilters || filtersAreActive ? "secondary" : "ghost"} size="sm" onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters}>Filters{filtersAreActive ? " · on" : ""}</Button>
          </div>
        </div>

        {showFilters ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-[#111214] p-4 sm:grid-cols-3">
            <SelectMenu label="Ownership" value={ownershipFilter} onChange={setOwnershipFilter} options={[
              { value: "ALL", label: "All ownership" },
              { value: "OWNED", label: "Owned by me" },
              { value: "SHARED", label: "Shared with me" },
            ] as const} />
            <SelectMenu label="Lifecycle" value={lifecycleFilter} onChange={setLifecycleFilter} options={[
              { value: "ACTIVE", label: "Active projects" },
              { value: "ARCHIVED", label: "Archived projects" },
              { value: "ALL", label: "Active and archived" },
            ] as const} />
            <SelectMenu label="Status" value={statusFilter} onChange={setStatusFilter} options={[
              { value: "ALL", label: "All statuses" },
              { value: "DRAFT", label: "Draft" },
              { value: "IN_REVIEW", label: "In review" },
              { value: "CHANGES_REQUESTED", label: "Revision requested" },
              { value: "APPROVED", label: "Approved" },
            ] as const} />
            {filtersAreActive ? <div className="sm:col-span-3"><Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button></div> : null}
          </div>
        ) : null}

        {notice ? <InlineAlert tone="error" title="A project action could not be completed" requestId={notice.requestId} className="mt-5">{getUserFacingErrorMessage(notice)}</InlineAlert> : null}

        <div className="mt-6" aria-live="polite" aria-busy={isLoading}>
          {isLoading ? <DashboardSkeleton /> : loadError ? (
            <EmptyState icon="!" title="Projects could not be loaded" description={<><p>{getUserFacingErrorMessage(loadError)}</p>{loadError.requestId ? <p className="mt-2 break-all font-mono text-xs text-zinc-500">Support reference: {loadError.requestId}</p> : null}</>} action={<Button variant="secondary" onClick={() => void fetchFirstPage()}>Try again</Button>} />
          ) : visibleProjects.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((project) => <ProjectCard key={project.id} project={project} currentUserId={currentUser.id} onEdit={openEditDialog} onToggleArchive={(item) => void handleToggleArchive(item)} onDelete={setDeletingProject} />)}
            </div>
          ) : (
            <EmptyState
              icon="◇"
              title={stats.total === 0 ? "No projects yet" : "Nothing matches"}
              description={stats.total === 0
                ? "Create a project and invite a client when it is ready for review."
                : "Change the search or clear the filters."}
              action={stats.total === 0
                ? <Button variant="primary" onClick={openCreateDialog}>Create your first project</Button>
                : <Button variant="secondary" onClick={resetFilters}>Clear filters</Button>}
            />
          )}
        </div>

        {pageInfo.hasMore ? <div className="mt-7 flex justify-center"><Button variant="secondary" onClick={() => void loadMore()} loading={isLoadingMore} loadingLabel="Loading…">Load more</Button></div> : null}
      </section>

      <ProjectFormDialog
        open={projectFormMode !== "closed"}
        project={
          projectFormMode === "edit"
            ? editingProject
            : null
        }
        returnFocusRef={
          projectFormMode === "create"
            ? projectFormReturnFocusRef
            : undefined
        }
        onClose={closeProjectDialog}
        onSubmit={
          projectFormMode === "edit"
            ? handleEdit
            : handleCreate
        }
      />
      <DeleteProjectDialog project={deletingProject} onClose={() => { if (!busyProjectId) setDeletingProject(null); }} onConfirm={handleDelete} />
    </div>
  );
}
