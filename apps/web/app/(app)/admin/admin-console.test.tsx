import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staffRoleLabel } from "../../../lib/admin-presentation";

describe("operational admin console", () => {
  it("presents campus and platform roles without scope escalation", () => {
    expect(staffRoleLabel({ platformRole: null, campusRole: "admin" })).toBe("Campus administrator");
    expect(staffRoleLabel({ platformRole: "admin", campusRole: null })).toBe("Platform administrator");
  });

  it("renders URL-backed accessible tabs with responsive spacing", () => {
    const source = readFileSync(new URL("./admin-console.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../redesign.css", import.meta.url), "utf8");
    expect(source).toContain('className="admin-tabs"');
    expect(source).toContain('aria-current={initialSection===item.id?"page":undefined}');
    expect(source).toContain('href={`/admin?section=${item.id}`}');
    expect(css).toContain(".admin-tabs { align-items: center; display: flex; gap:");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain(".admin-tabs a:focus-visible");
  });

  it("routes dashboard, cases, and content through capability-guarded RPCs", () => {
    const dashboard = readFileSync(new URL("../../api/v1/admin/dashboard/route.ts", import.meta.url), "utf8");
    const cases = readFileSync(new URL("../../api/v1/admin/cases/route.ts", import.meta.url), "utf8");
    const content = readFileSync(new URL("../../api/v1/admin/content/route.ts", import.meta.url), "utf8");
    expect(dashboard).toContain('requireStaffCapability(request, "cases.read")');
    expect(dashboard).toContain('rpc("admin_dashboard_summary")');
    expect(cases).toContain('requireStaffCapability(request, "cases.read")');
    expect(cases).toContain('rpc("admin_case_queue_v3"');
    expect(content).toContain('requireStaffCapability(request, "content.read")');
    expect(content).toContain('requireStaffCapability(request, "content.act")');
    expect(content).toContain('rpc("apply_admin_content_action"');
  });
});