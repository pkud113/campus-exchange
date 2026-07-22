import { describe, expect, it } from "vitest";
import { profileTabs } from "./profile-tabs";

describe("profile activity navigation", () => {
  it("keeps the five peer views in the approved order", () => {
    expect(profileTabs.map((tab) => tab.id)).toEqual(["posts", "listings", "events", "organizations", "about"]);
  });
});
