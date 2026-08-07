import { describe, expect, it } from "vitest";
import { shouldSubmitFeedbackOnKeyDown } from "@/lib/feedback/keyboard";

const base = {
  key: "Enter",
  isComposing: false,
  isPinned: true,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
};

describe("feedback keyboard shortcuts", () => {
  it("submits pinned feedback with Enter", () => {
    expect(shouldSubmitFeedbackOnKeyDown(base)).toBe(true);
  });

  it("keeps Shift+Enter available for a new line", () => {
    expect(shouldSubmitFeedbackOnKeyDown({ ...base, shiftKey: true })).toBe(false);
  });

  it("uses Ctrl or Command plus Enter for general feedback", () => {
    expect(shouldSubmitFeedbackOnKeyDown({ ...base, isPinned: false })).toBe(false);
    expect(shouldSubmitFeedbackOnKeyDown({ ...base, isPinned: false, ctrlKey: true })).toBe(true);
    expect(shouldSubmitFeedbackOnKeyDown({ ...base, isPinned: false, metaKey: true })).toBe(true);
  });

  it("does not submit while an IME composition is active or for another key", () => {
    expect(shouldSubmitFeedbackOnKeyDown({ ...base, isComposing: true })).toBe(false);
    expect(shouldSubmitFeedbackOnKeyDown({ ...base, key: "Escape" })).toBe(false);
  });
});
