import { describe, expect, it } from "vitest";
import { buildOptimisticComment, isOptimisticComment } from "@/lib/workspace/optimistic-feedback";

describe("optimistic feedback", () => {
  it("builds an immediately renderable text comment with the exact anchor", () => {
    const comment = buildOptimisticComment({
      assetId: "asset-1",
      authorId: "user-1",
      author: { id: "user-1", name: "Safan" },
      text: "Move this down",
      anchor: {
        anchorType: "POINT",
        xPos: 45,
        yPos: 32,
        pageNumber: null,
        lineStart: null,
        lineEnd: null,
        columnStart: null,
        columnEnd: null,
        timestamp: null,
      },
      id: "local-feedback-test",
      now: "2026-08-08T08:00:00.000Z",
    });

    expect(comment.id).toBe("local-feedback-test");
    expect(comment.text).toBe("Move this down");
    expect(comment.xPos).toBe(45);
    expect(comment.yPos).toBe(32);
    expect(comment.hasAudio).toBe(false);
    expect(comment.isResolved).toBe(false);
    expect(isOptimisticComment(comment)).toBe(true);
  });

  it("does not classify persisted server comments as optimistic", () => {
    expect(isOptimisticComment("comment-123")).toBe(false);
  });
});
