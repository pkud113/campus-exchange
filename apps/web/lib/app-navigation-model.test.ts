import { describe, expect, it } from "vitest";
import { buildNavigationModel } from "./app-navigation-model";

describe("V1 information architecture", () => {
  it("exposes every primary V1 area and global utilities", () => {
    const model = buildNavigationModel({ handle: "student", isStaff: false, discussionsEnabled: true, notificationCount: 2, messageCount: 3 });
    expect(model.main.map(({ href }) => href)).toEqual(["/home", "/search", "/marketplace", "/social", "/organizations", "/events", "/discussions", "/messages"]);
    expect(model.management.map(({ href }) => href)).toContain("/notifications");
    expect(model.account.map(({ href }) => href)).toEqual(["/u/student", "/settings"]);
  });

  it("keeps moderation and feature-gated discussions contextual", () => {
    const student = buildNavigationModel({ handle: "student", isStaff: false, discussionsEnabled: false, notificationCount: 0, messageCount: 0 });
    const staff = buildNavigationModel({ handle: "staff", isStaff: true, discussionsEnabled: true, notificationCount: 0, messageCount: 0 });
    expect(student.main.some(({ href }) => href === "/discussions")).toBe(false);
    expect(student.management.some(({ href }) => href === "/admin")).toBe(false);
    expect(staff.management.some(({ href }) => href === "/admin")).toBe(true);
  });
});
