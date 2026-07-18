import { describe, expect, it } from "vitest";
import type { ApiCollection, UnifiedSearchHit } from "./index";

describe("shared transport types", () => {
  it("represent a cursor collection without application dependencies", () => {
    const hit: UnifiedSearchHit = {
      id: "00000000-0000-4000-8000-000000000001",
      kind: "organization",
      title: "Robotics Club",
      subtitle: "Campus Alpha",
      href: "/organizations/robotics",
      imageMediaId: null,
      campus: { slug: "campus-alpha", shortName: "Alpha" },
      visibility: "campus_only",
      occurredAt: "2026-07-18T00:00:00.000Z",
    };
    const page: ApiCollection<UnifiedSearchHit> = { data: [hit], meta: { nextCursor: null } };
    expect(page.data[0]?.kind).toBe("organization");
  });
});
