import assert from "node:assert/strict";
import test from "node:test";
import { resolveFeedbackAnchor } from "../../lib/feedback/anchor-core.ts";

test("PDF feedback keeps page-local coordinates", () => {
  assert.deepEqual(resolveFeedbackAnchor({ location: { x: 25, y: 75 }, pageNumber: 3 }), {
    anchorType: "PDF_POINT", xPos: 25, yPos: 75, pageNumber: 3,
    lineStart: null, lineEnd: null, columnStart: null, columnEnd: null, timestamp: null,
  });
});

test("source feedback uses a line range without visual coordinates", () => {
  assert.deepEqual(resolveFeedbackAnchor({ lineStart: 12, lineEnd: 18 }), {
    anchorType: "CODE_RANGE", xPos: null, yPos: null, pageNumber: null,
    lineStart: 12, lineEnd: 18, columnStart: null, columnEnd: null, timestamp: null,
  });
});

test("video feedback retains timestamp and optional point", () => {
  assert.equal(resolveFeedbackAnchor({ location: { x: 50, y: 40 }, timestamp: 9.5 }).anchorType, "VIDEO_POINT");
});
