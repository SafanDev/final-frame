import Button from "@/components/ui/Button";
import { fieldControlClass } from "@/components/ui/Field";
import SelectMenu from "@/components/ui/SelectMenu";
import type {
  LifecycleFilter,
  OwnershipFilter,
  SortOption,
  StatusFilter,
} from "@/components/dashboard/dashboardTypes";

interface DashboardToolbarProps {
  matching: number;
  search: string;
  sort: SortOption;
  ownershipFilter: OwnershipFilter;
  lifecycleFilter: LifecycleFilter;
  statusFilter: StatusFilter;
  showFilters: boolean;
  filtersAreActive: boolean;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortOption) => void;
  onOwnershipChange: (value: OwnershipFilter) => void;
  onLifecycleChange: (value: LifecycleFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onToggleFilters: () => void;
  onReset: () => void;
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  );
}

export default function DashboardToolbar({
  matching,
  search,
  sort,
  ownershipFilter,
  lifecycleFilter,
  statusFilter,
  showFilters,
  filtersAreActive,
  onSearchChange,
  onSortChange,
  onOwnershipChange,
  onLifecycleChange,
  onStatusChange,
  onToggleFilters,
  onReset,
}: DashboardToolbarProps) {
  return (
    <div className="ff-dashboard-tools">
      <div className="ff-dashboard-tools-heading">
        <div className="ff-dashboard-results-title">
          <h2 id="projects-heading">Your projects</h2>
          <span>{matching}</span>
        </div>

        <div className="ff-dashboard-toolbar-controls">
          <div className="ff-project-search">
            <label htmlFor="project-search" className="sr-only">Search projects</label>
            <input
              id="project-search"
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search projects"
              className={`${fieldControlClass} min-h-10 py-0`}
            />
          </div>

          <SelectMenu
            label="Sort projects"
            hideLabel
            value={sort}
            onChange={onSortChange}
            className="ff-project-sort"
            buttonClassName="min-h-10"
            options={[
              { value: "UPDATED_DESC", label: "Recently updated" },
              { value: "CREATED_DESC", label: "Newest first" },
              { value: "TITLE_ASC", label: "Name A–Z" },
            ] as const}
          />

          <Button
            variant={showFilters || filtersAreActive ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleFilters}
            aria-expanded={showFilters}
          >
            <FilterIcon />
            Filters
            {filtersAreActive ? <span className="ff-filter-active-dot" aria-label="Filters active" /> : null}
          </Button>
        </div>
      </div>

      {showFilters ? (
        <div className="ff-dashboard-filter-panel">
          <SelectMenu
            label="Projects"
            value={ownershipFilter}
            onChange={onOwnershipChange}
            options={[
              { value: "ALL", label: "All projects" },
              { value: "OWNED", label: "Created by me" },
              { value: "SHARED", label: "Shared with me" },
            ] as const}
          />
          <SelectMenu
            label="Show"
            value={lifecycleFilter}
            onChange={onLifecycleChange}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "ARCHIVED", label: "Archived" },
              { value: "ALL", label: "All" },
            ] as const}
          />
          <SelectMenu
            label="Status"
            value={statusFilter}
            onChange={onStatusChange}
            options={[
              { value: "ALL", label: "Any status" },
              { value: "DRAFT", label: "Draft" },
              { value: "IN_REVIEW", label: "In review" },
              { value: "CHANGES_REQUESTED", label: "Changes requested" },
              { value: "APPROVED", label: "Approved" },
            ] as const}
          />
          {filtersAreActive ? (
            <div className="ff-dashboard-filter-reset">
              <Button variant="ghost" size="sm" onClick={onReset}>Clear</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
