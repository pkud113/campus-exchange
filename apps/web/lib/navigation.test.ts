import { describe, expect, it } from "vitest";
import { isNavigationActive } from "./navigation";

describe("isNavigationActive", () => {
  it("matches a route and its nested pages", () => {
    expect(isNavigationActive("/marketplace", "/marketplace")).toBe(true);
    expect(isNavigationActive("/my/listings/123", "/my/listings")).toBe(true);
  });

  it("does not let Home claim unrelated pages", () => {
    expect(isNavigationActive("/home", "/home")).toBe(true);
    expect(isNavigationActive("/marketplace", "/home")).toBe(false);
  });
});
