import { describe, expect, it } from "vitest";
import { buildFeedbackDeepLink, buildProjectLink, nextOpenFeedback, parseFeedbackDeepLink } from "@/lib/workspace/review-navigation";
import type { ProjectComment } from "@/lib/api/types";

function comment(id: string, isResolved: boolean, createdAt: string): ProjectComment {
  return {
    id,
    text: id,
    anchorType: "GENERAL",
    xPos: null,
    yPos: null,
    pageNumber: null,
    lineStart: null,
    lineEnd: null,
    columnStart: null,
    columnEnd: null,
    hasAudio: false,
    audioMimeType: null,
    timestamp: null,
    isBlocking: false,
    isResolved,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
    assetId: "asset-1",
    authorId: "user-1",
    author: { id: "user-1", name: "User" },
  };
}

describe("review navigation", () => {
  it("parses existing notification-style asset/comment links", () => {
    expect(parseFeedbackDeepLink("?asset=a1&comment=c1")).toEqual({ assetId: "a1", commentId: "c1" });
  });

  it("builds share links without stale hashes and can return to the project link", () => {
    const link = buildFeedbackDeepLink("https://example.com/project/p1?foo=bar#old", "a1", "c1");
    expect(link).toBe("https://example.com/project/p1?foo=bar&asset=a1&comment=c1");
    expect(buildProjectLink(link)).toBe("https://example.com/project/p1?foo=bar");
  });

  it("cycles only unresolved feedback in chronological review order", () => {
    const comments = [
      comment("c2", false, "2026-01-02T00:00:00.000Z"),
      comment("closed", true, "2026-01-01T12:00:00.000Z"),
      comment("c1", false, "2026-01-01T00:00:00.000Z"),
    ];
    expect(nextOpenFeedback(comments, null, 1)?.id).toBe("c1");
    expect(nextOpenFeedback(comments, "c1", 1)?.id).toBe("c2");
    expect(nextOpenFeedback(comments, "c1", -1)?.id).toBe("c2");
  });
});
