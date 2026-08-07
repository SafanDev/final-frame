import { describe, expect, it } from "vitest";
import { loginHref, registerHref, safeRelativeCallback } from "@/lib/auth/redirects";

describe("safeRelativeCallback", () => {
  it("keeps safe internal paths including query strings and hashes", () => {
    expect(safeRelativeCallback("/project/abc?tab=activity#comment-1")).toBe(
      "/project/abc?tab=activity#comment-1",
    );
  });

  it.each([
    ["https://evil.example/path", "/"],
    ["//evil.example/path", "/"],
    ["javascript:alert(1)", "/"],
    ["project/abc", "/"],
    [null, "/fallback"],
    [undefined, "/fallback"],
  ])("rejects unsafe callback %p", (candidate, expected) => {
    expect(safeRelativeCallback(candidate, expected === "/fallback" ? "/fallback" : "/")).toBe(expected);
  });

  it("uses the first array value", () => {
    expect(safeRelativeCallback(["/project/one", "/project/two"])).toBe("/project/one");
  });
});

describe("authentication links", () => {
  it("encodes the preserved destination", () => {
    expect(loginHref("/invite")).toBe(
      "/login?callbackUrl=%2Finvite",
    );
    expect(registerHref("/project/abc")).toBe(
      "/register?callbackUrl=%2Fproject%2Fabc",
    );
  });
});
