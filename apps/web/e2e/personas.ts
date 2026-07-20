import path from "node:path";

export const personaKeys = [
  "studentA",
  "studentB",
  "studentC",
  "organizationOwner",
  "organizationAdministrator",
  "organizationModerator",
  "organizationOfficer",
  "organizationMember",
  "unauthorizedNonmember",
  "campusModerator",
  "platformModerator",
  "platformAdministrator",
] as const;

export type PersonaKey = (typeof personaKeys)[number];

export const personas: Record<PersonaKey, { email: string; handle: string; displayName: string; campus: "a" | "b"; staff?: "campus_moderator" | "platform_moderator" | "platform_admin" }> = {
  studentA: { email: "ce.e2e.student.a@msu.edu", handle: "ce_student_a", displayName: "Student A", campus: "a" },
  studentB: { email: "ce.e2e.student.b@msu.edu", handle: "ce_student_b", displayName: "Student B", campus: "a" },
  studentC: { email: "ce.e2e.student.c@illinois.edu", handle: "ce_student_c", displayName: "Student C", campus: "b" },
  organizationOwner: { email: "ce.e2e.org.owner@msu.edu", handle: "ce_org_owner", displayName: "Organization Owner", campus: "a" },
  organizationAdministrator: { email: "ce.e2e.org.admin@msu.edu", handle: "ce_org_admin", displayName: "Organization Administrator", campus: "a" },
  organizationModerator: { email: "ce.e2e.org.moderator@msu.edu", handle: "ce_org_moderator", displayName: "Organization Moderator", campus: "a" },
  organizationOfficer: { email: "ce.e2e.org.officer@msu.edu", handle: "ce_org_officer", displayName: "Organization Officer", campus: "a" },
  organizationMember: { email: "ce.e2e.org.member@msu.edu", handle: "ce_org_member", displayName: "Organization Member", campus: "a" },
  unauthorizedNonmember: { email: "ce.e2e.nonmember@msu.edu", handle: "ce_nonmember", displayName: "Unauthorized Nonmember", campus: "a" },
  campusModerator: { email: "ce.e2e.campus.moderator@msu.edu", handle: "ce_campus_moderator", displayName: "Campus Moderator", campus: "a", staff: "campus_moderator" },
  platformModerator: { email: "ce.e2e.platform.moderator@illinois.edu", handle: "ce_platform_moderator", displayName: "Platform Moderator", campus: "b", staff: "platform_moderator" },
  platformAdministrator: { email: "ce.e2e.platform.admin@illinois.edu", handle: "ce_platform_admin", displayName: "Platform Administrator", campus: "b", staff: "platform_admin" },
};

export const e2eOrganization = { slug: "ce-e2e-product-alignment", name: "CE Product Alignment" };

export function personaStorageState(persona: PersonaKey) {
  return path.resolve(process.cwd(), ".playwright", ".auth", `${persona}.json`);
}
