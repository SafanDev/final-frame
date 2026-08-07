import assert from "node:assert/strict";
import test from "node:test";
import { safeDownloadName } from "../../lib/api/download-name.ts";

test("download names cannot contain paths, traversal runs or control characters", () => {
  assert.equal(
    safeDownloadName("../../private\\secret\u0000.ndjson", "export.ndjson"),
    ".-.-private-secret-.ndjson",
  );
});

test("download names are bounded and fall back when empty", () => {
  assert.equal(safeDownloadName(" \u0000/\\ ", "export.ndjson"), "---");
  assert.equal(safeDownloadName("", "export.ndjson"), "export.ndjson");
  assert.equal(safeDownloadName("a".repeat(500), "export.ndjson").length, 180);
});
