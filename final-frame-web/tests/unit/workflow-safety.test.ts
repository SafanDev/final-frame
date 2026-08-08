import { describe, expect, it, vi } from "vitest";
import {
  getWorkspaceWorkflowBlockers,
  setWorkspaceWorkflowBlocker,
  subscribeWorkspaceWorkflowSafety,
} from "@/lib/workspace/workflow-safety";

describe("workspace workflow safety", () => {
  it("tracks active blockers and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWorkspaceWorkflowSafety(listener);

    setWorkspaceWorkflowBlocker("upload-test", "Upload in progress");
    expect(getWorkspaceWorkflowBlockers()).toContainEqual({ id: "upload-test", message: "Upload in progress" });
    expect(listener).toHaveBeenCalledTimes(1);

    setWorkspaceWorkflowBlocker("upload-test", null);
    expect(getWorkspaceWorkflowBlockers().find((item) => item.id === "upload-test")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
