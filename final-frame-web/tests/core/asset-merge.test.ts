import assert from "node:assert/strict";
import test from "node:test";
import { mergeAssetsByFreshness } from "../../lib/workspace/asset-merge-core.ts";

const asset = (id: string, stackKey: string, updatedAt: string, label: string) => ({ id, stackKey, updatedAt, label });

test("older pagination responses cannot overwrite a newer local asset", () => {
  const current = [asset("a", "stack", "2026-07-28T10:00:00.000Z", "new")];
  const incoming = [asset("a", "stack", "2026-07-28T09:00:00.000Z", "stale")];
  assert.equal(mergeAssetsByFreshness(current, incoming)[0]?.label, "new");
});

test("asset tombstones stop a stale page from reinserting a deleted version", () => {
  const deletedAt = Date.parse("2026-07-28T11:00:00.000Z");
  const incoming = [asset("a", "stack", "2026-07-28T10:00:00.000Z", "deleted")];
  assert.deepEqual(mergeAssetsByFreshness([], incoming, { ids: new Map([["a", deletedAt]]) }), []);
});

test("stack tombstones reject old versions but permit a genuinely new upload", () => {
  const deletedAt = Date.parse("2026-07-28T11:00:00.000Z");
  const incoming = [
    asset("old", "stack", "2026-07-28T10:00:00.000Z", "old"),
    asset("new", "stack", "2026-07-28T12:00:00.000Z", "new"),
  ];
  assert.deepEqual(
    mergeAssetsByFreshness([], incoming, { stacks: new Map([["stack", deletedAt]]) }).map((item) => item.id),
    ["new"],
  );
});
