import { describe, expect, it } from "vitest";
import { loginInputSchema, safeInternalRedirectPath } from "./index";

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
});
