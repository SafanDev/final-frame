import type { CursorPageQuery, ProjectStatus } from "@/lib/api/types";

export type OwnershipFilter = "ALL" | "OWNED" | "SHARED";
export type LifecycleFilter = "ACTIVE" | "ARCHIVED" | "ALL";
export type StatusFilter = "ALL" | ProjectStatus;
export type SortOption = "UPDATED_DESC" | "CREATED_DESC" | "TITLE_ASC";
export type ProjectFormMode = "closed" | "create" | "edit";

export const sortQuery: Readonly<Record<SortOption, NonNullable<CursorPageQuery["sort"]>>> = {
  UPDATED_DESC: "updated_desc",
  CREATED_DESC: "created_desc",
  TITLE_ASC: "title_asc",
};
