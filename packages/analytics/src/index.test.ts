import { describe, expect, it } from "vitest";
import { analyticsEvents, createAnalyticsEvent } from "./index";

describe("analytics conventions", () => {
  it("creates a versioned privacy-reviewed event", () => {
    const event = createAnalyticsEvent({ name: analyticsEvents.listingCreated, sessionId: "session", surface: "web_desktop", properties: { visibility: "campus_only" } });
    expect(event.eventVersion).toBe(1);
  });

  it("rejects sensitive free-form property names", () => {
    expect(() => createAnalyticsEvent({ name: analyticsEvents.searchOpened, sessionId: "session", surface: "web_mobile", properties: { query: "a person" } })).toThrow(/privacy-safe/);
  });
});
