import { describe, expect, it } from "vitest";
import { normalizeInvitationToken } from "@/lib/invitations/token-storage";

describe("invitation token handling", () => {
  it("normalizes valid one-time tokens", () => {
    expect(normalizeInvitationToken(" A".padEnd(65, "B"))).toBe(`a${"b".repeat(63)}`);
  });

  it("rejects malformed or missing tokens", () => {
    expect(normalizeInvitationToken(null)).toBeNull();
    expect(normalizeInvitationToken("abc")).toBeNull();
    expect(normalizeInvitationToken("g".repeat(64))).toBeNull();
  });
});
