import { describe, expect, it } from "vitest";
import {
  composeFeedbackText,
  splitFeedbackText,
  updateFeedbackNote,
} from "@/lib/feedback/transcript";

describe("feedback transcript storage", () => {
  it("keeps a typed note without audio unchanged", () => {
    expect(composeFeedbackText("  Move the logo  ", "ignored", false)).toBe("Move the logo");
  });

  it("stores an editable transcript inside the same comment", () => {
    const value = composeFeedbackText("Increase contrast", "The footer is difficult to read.", true);
    expect(value).toBe("Increase contrast\n\nTranscript:\nThe footer is difficult to read.");
    expect(splitFeedbackText(value)).toEqual({
      note: "Increase contrast",
      transcript: "The footer is difficult to read.",
    });
  });

  it("supports voice-only feedback without creating a second comment", () => {
    const value = composeFeedbackText("", "Please align these cards.", true);
    expect(splitFeedbackText(value)).toEqual({ note: "", transcript: "Please align these cards." });
  });

  it("preserves the transcript when the written note is edited", () => {
    const original = composeFeedbackText("Old note", "Spoken details", true);
    expect(updateFeedbackNote(original, "Updated note")).toBe("Updated note\n\nTranscript:\nSpoken details");
  });
});
