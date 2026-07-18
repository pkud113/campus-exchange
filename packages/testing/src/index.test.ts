import { describe, expect, it } from "vitest";
import { createProfileFixture, testIds } from "./index";

describe("testing fixtures", () => {
  it("uses explicitly synthetic campus identities", () => {
    expect(createProfileFixture().campus.slug).toBe("campus-alpha");
    expect(createProfileFixture({ id: testIds.studentBeta }).id).toBe(testIds.studentBeta);
  });
});
