import { describe, expect, it } from "vitest";
import { loginInputSchema, onboardingInputSchema, safeInternalRedirectPath } from "./index";

describe("authentication redirect contracts", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%5cevil.example",
    "/%2f%2fevil.example",
    "/home%0d%0aLocation:https://evil.example"
  ])("rejects unsafe redirect %s", (value) => {
    expect(safeInternalRedirectPath(value)).toBeNull();
    expect(loginInputSchema.safeParse({ identifier: "student@example.edu", password: "a-secure-password", next: value }).success).toBe(false);
  });

  it("preserves a canonical internal path, query, and fragment", () => {
    expect(safeInternalRedirectPath("/messages?view=sent#top")).toBe("/messages?view=sent#top");
  });

  it("keeps onboarding input bounded while leaving canonical safety to the trusted server policy", () => {
    expect(onboardingInputSchema.safeParse({ username: "Ｆｒｉｅｎｄ２０２６", password: "a-secure-password" }).success).toBe(true);
    expect(onboardingInputSchema.safeParse({ username: "x".repeat(65), password: "a-secure-password" }).success).toBe(false);
    expect(onboardingInputSchema.safeParse({ username: "student", password: "a-secure-password", campusId: "forged" }).success).toBe(false);
  });
});
