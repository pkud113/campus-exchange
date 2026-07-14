import { describe, expect, it } from "vitest";
import { buildMarketplaceHref } from "./marketplace-url";

describe("buildMarketplaceHref", () => {
  it("preserves compatible filters and resets the cursor when requested", () => {
    expect(
      buildMarketplaceHref(
        { q: "desk", category: "furniture", sort: "price_asc", cursor: "old" },
        { category: "books", cursor: null },
      ),
    ).toBe("/marketplace?q=desk&category=books&sort=price_asc");
  });

  it("omits empty and default values", () => {
    expect(buildMarketplaceHref({ sort: "newest" }, { category: null })).toBe("/marketplace");
  });
});
