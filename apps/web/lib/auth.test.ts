import { describe, expect, it } from "vitest";
import { hmacSha256, sixDigitVerificationCode } from "./verification-crypto";

describe("pending-domain verification primitives", () => {
  it("uses a keyed, normalized digest instead of a reversible email value", async () => {
    const secret = "test-secret-that-is-at-least-thirty-two-characters";
    const lower = await hmacSha256("email:student@example.edu", secret);
    const mixed = await hmacSha256(" EMAIL:Student@Example.EDU ", secret);
    expect(lower).toBe(mixed);
    expect(lower).toMatch(/^[0-9a-f]{64}$/);
    expect(lower).not.toContain("student");
  });

  it("generates fixed-width numeric ownership codes", () => {
    for (let index = 0; index < 100; index += 1) expect(sixDigitVerificationCode()).toMatch(/^[0-9]{6}$/);
  });
});
