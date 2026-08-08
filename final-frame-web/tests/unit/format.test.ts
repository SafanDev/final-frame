import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatRelativeDate,
  formatShortDate,
  statusLabel,
} from "@/lib/utils/format";

describe("formatting utilities", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats valid dates and rejects invalid values", () => {
    const formatted = formatShortDate(new Date("2026-07-22T00:00:00.000Z"));

    expect(formatted).toContain("2026");
    expect(formatShortDate("not-a-date")).toBe("Unknown date");
    expect(formatRelativeDate("not-a-date")).toBe("Unknown date");
  });

  it("formats seconds, minutes, hours and days relative to now", () => {
    expect(formatRelativeDate(new Date(now.getTime() + 30_000))).toBe("in 30 seconds");
    expect(formatRelativeDate(new Date(now.getTime() + 5 * 60_000))).toBe("in 5 minutes");
    expect(formatRelativeDate(new Date(now.getTime() - 2 * 60 * 60_000))).toBe("2 hours ago");
    expect(formatRelativeDate(new Date(now.getTime() + 3 * 24 * 60 * 60_000))).toBe("in 3 days");
  });

  it("falls back to a short date for dates at least thirty days away", () => {
    const distantDate = new Date(now.getTime() - 45 * 24 * 60 * 60_000);

    expect(formatRelativeDate(distantDate)).toBe(formatShortDate(distantDate));
  });

  it("turns status constants into readable labels", () => {
    expect(statusLabel("IN_REVIEW")).toBe("In Review");
    expect(statusLabel("APPROVED")).toBe("Approved");
  });
});
