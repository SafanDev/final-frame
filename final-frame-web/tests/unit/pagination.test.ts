import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  mergePageItems,
  normalizePageLimit,
  withCursorQuery,
} from "@/lib/api/pagination";

describe("pagination helpers", () => {
  it("normalizes page limits", () => {
    expect(normalizePageLimit()).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageLimit(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageLimit(0)).toBe(1);
    expect(normalizePageLimit(12.9)).toBe(12);
    expect(normalizePageLimit(500)).toBe(MAX_PAGE_SIZE);
  });

  it("builds encoded cursor query strings", () => {
    expect(withCursorQuery("/api/projects", { cursor: "a b/+", limit: 25 })).toBe(
      "/api/projects?cursor=a+b%2F%2B&limit=25",
    );
    expect(withCursorQuery("/api/projects")).toBe(
      `/api/projects?limit=${DEFAULT_PAGE_SIZE}`,
    );
    expect(withCursorQuery("/api/projects", {
      q: "  landing page  ",
      status: "IN_REVIEW",
      archived: "false",
      scope: "shared",
      sort: "title_asc",
      limit: 20,
    })).toBe(
      "/api/projects?limit=20&q=landing+page&status=IN_REVIEW&archived=false&scope=shared&sort=title_asc",
    );
  });

  it("merges pages without duplicate IDs and keeps incoming updates", () => {
    expect(
      mergePageItems(
        [{ id: "1", name: "old" }, { id: "2", name: "two" }],
        [{ id: "1", name: "new" }, { id: "3", name: "three" }],
      ),
    ).toEqual([
      { id: "1", name: "new" },
      { id: "2", name: "two" },
      { id: "3", name: "three" },
    ]);
  });
});
