import { describe, expect, it } from "vitest";
import { interests, normalizedUniquePair, searchQuery } from "./index";

describe("shared validation", () => {
  it("normalizes interest values and removes duplicates", () => {
    expect(interests.parse(["Robotics", "robotics", "Film"])).toEqual(["robotics", "film"]);
  });

  it("creates one canonical relationship pair", () => {
    const first = "00000000-0000-4000-8000-000000000002";
    const second = "00000000-0000-4000-8000-000000000001";
    expect(normalizedUniquePair(first, second)).toEqual([second, first]);
    expect(() => normalizedUniquePair(first, first)).toThrow(/different profiles/);
  });

  it("bounds unified search", () => {
    expect(searchQuery.parse({ q: "robotics", limit: "50" }).limit).toBe(50);
    expect(() => searchQuery.parse({ q: "x", limit: 100 })).toThrow();
  });
});
