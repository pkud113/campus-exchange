import { describe, expect, it } from "vitest";
import {
  isNavigationActive,
  isSidebarCollapsed,
  sidebarPreferenceCookie,
  sidebarPreferenceValue,
} from "./navigation";

describe("isNavigationActive", () => {
  it("matches a route and its nested pages", () => {
    expect(isNavigationActive("/marketplace", "/marketplace")).toBe(true);
    expect(isNavigationActive("/my/listings/123", "/my/listings")).toBe(true);
  });

  it("does not let Home claim unrelated pages", () => {
    expect(isNavigationActive("/home", "/home")).toBe(true);
    expect(isNavigationActive("/marketplace", "/home")).toBe(false);
  });

  it("round-trips expanded and collapsed sidebar preferences", () => {
    expect(sidebarPreferenceValue(true)).toBe("collapsed");
    expect(sidebarPreferenceValue(false)).toBe("expanded");
    expect(isSidebarCollapsed("collapsed")).toBe(true);
    expect(isSidebarCollapsed("expanded")).toBe(false);
    expect(isSidebarCollapsed(null)).toBe(false);
  });

  it("creates a persistent same-site preference cookie", () => {
    expect(sidebarPreferenceCookie(true, true)).toBe(
      "campus-sidebar=collapsed; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(sidebarPreferenceCookie(false, false)).toBe(
      "campus-sidebar=expanded; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
});
