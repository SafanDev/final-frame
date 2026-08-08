import { beforeEach, describe, expect, it } from "vitest";
import {
  clearFeedbackDraft,
  clearPendingFeedbackAnchor,
  loadFeedbackDraft,
  loadFilePanelMemory,
  loadLastActiveAssetId,
  loadPendingFeedbackAnchor,
  loadReviewViewState,
  loadWorkspaceChromeMemory,
  saveFeedbackDraft,
  saveFilePanelMemory,
  saveLastActiveAssetId,
  savePendingFeedbackAnchor,
  saveReviewViewState,
  saveWorkspaceChromeMemory,
} from "@/lib/workspace/review-session";

describe("review session memory", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("restores and clears feedback drafts per file and mode", () => {
    saveFeedbackDraft("user-1", "project-1", "asset-1", "general", "Keep this note");
    saveFeedbackDraft("user-1", "project-1", "asset-1", "pinned", "Pinned note");

    expect(loadFeedbackDraft("user-1", "project-1", "asset-1", "general")).toBe("Keep this note");
    expect(loadFeedbackDraft("user-1", "project-1", "asset-1", "pinned")).toBe("Pinned note");

    clearFeedbackDraft("user-1", "project-1", "asset-1", "general");
    expect(loadFeedbackDraft("user-1", "project-1", "asset-1", "general")).toBe("");
    expect(loadFeedbackDraft("user-1", "project-1", "asset-1", "pinned")).toBe("Pinned note");
  });

  it("stores pending anchors and clamps unsafe point data on read", () => {
    savePendingFeedbackAnchor("project-1", "asset-1", {
      surfacePoint: { x: 120, y: -4 },
      apiLocation: { x: 20, y: 80 },
      pageNumber: 2,
      lineStart: null,
      lineEnd: null,
      timestamp: 4.5,
    });

    expect(loadPendingFeedbackAnchor("project-1", "asset-1")).toEqual({
      surfacePoint: { x: 100, y: 0 },
      apiLocation: { x: 20, y: 80 },
      pageNumber: 2,
      lineStart: null,
      lineEnd: null,
      timestamp: 4.5,
    });

    clearPendingFeedbackAnchor("project-1", "asset-1");
    expect(loadPendingFeedbackAnchor("project-1", "asset-1")).toBeNull();
  });

  it("restores view position, active file, and file panel state", () => {
    saveReviewViewState("project-1", "asset-1", {
      scale: 1.4,
      positionX: 18,
      positionY: -12,
      scrollLeft: 45,
      scrollTop: 320,
      videoTime: 9.25,
    });
    saveLastActiveAssetId("project-1", "asset-1");
    saveFilePanelMemory("project-1", { search: "hero", category: "image", expandedStack: "stack-1" });

    expect(loadReviewViewState("project-1", "asset-1")).toEqual({
      scale: 1.4,
      positionX: 18,
      positionY: -12,
      scrollLeft: 45,
      scrollTop: 320,
      videoTime: 9.25,
    });
    expect(loadLastActiveAssetId("project-1")).toBe("asset-1");
    expect(loadFilePanelMemory("project-1")).toEqual({ search: "hero", category: "image", expandedStack: "stack-1" });

    saveWorkspaceChromeMemory("project-1", "desktop", {
      assetSidebarOpen: false,
      feedbackSidebarOpen: true,
      rightSidebarTab: "ACTIVITY",
    });
    expect(loadWorkspaceChromeMemory("project-1", "desktop")).toEqual({
      assetSidebarOpen: false,
      feedbackSidebarOpen: true,
      rightSidebarTab: "ACTIVITY",
    });
  });
});
