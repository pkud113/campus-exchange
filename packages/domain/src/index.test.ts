import { describe, expect, it } from "vitest";
import { assertListingTransition, canTransitionListing, isVerificationCurrent, normalizeSchoolDomain } from "./index";

describe("listing lifecycle", () => {
  it("allows the intended forward path", () => expect(canTransitionListing("active", "reserved")).toBe(true));
  it("keeps terminal states terminal", () => expect(canTransitionListing("sold", "active")).toBe(false));
  it("requires a buyer for reservation", () => expect(() => assertListingTransition("active", "reserved")).toThrow(/buyer/i));
});

describe("student verification", () => {
  it("normalizes exact domains", () => expect(normalizeSchoolDomain("Student@School.EDU")).toBe("school.edu"));
  it("expires after one year", () => expect(isVerificationCurrent(new Date("2024-01-01"), new Date("2025-01-02"))).toBe(false));
});
