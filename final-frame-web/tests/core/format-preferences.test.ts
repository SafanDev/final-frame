import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTime, formatShortDate } from "../../lib/utils/format.ts";

const instant = "2026-07-28T00:30:00.000Z";

test("date-time formatting applies the saved time zone", () => {
  const utc = formatDateTime(instant, { locale: "en-US", timeZone: "UTC" });
  const colombo = formatDateTime(instant, { locale: "en-US", timeZone: "Asia/Colombo" });
  assert.notEqual(utc, colombo);
  assert.match(utc, /Jul 28, 2026/);
  assert.match(colombo, /Jul 28, 2026/);
});

test("short-date formatting uses the selected locale deterministically", () => {
  assert.equal(formatShortDate(instant, { locale: "en-US", timeZone: "UTC" }), "Jul 28, 2026");
  assert.equal(formatShortDate(instant, { locale: "en-GB", timeZone: "UTC" }), "28 Jul 2026");
});
