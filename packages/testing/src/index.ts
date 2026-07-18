import type { CampusContext, ProfileSummary } from "@campus-exchange/shared-types";

export const testIds = {
  campusAlpha: "10000000-0000-4000-8000-000000000001",
  campusBeta: "10000000-0000-4000-8000-000000000002",
  studentAlpha: "20000000-0000-4000-8000-000000000001",
  studentBeta: "20000000-0000-4000-8000-000000000002",
} as const;

export function createCampusFixture(overrides: Partial<CampusContext> = {}): CampusContext {
  return { id: testIds.campusAlpha, slug: "campus-alpha", name: "Campus Alpha University", shortName: "Alpha", ...overrides };
}

export function createProfileFixture(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    id: testIds.studentAlpha,
    username: "student_alpha",
    displayName: "Student Alpha",
    avatarMediaId: null,
    campus: createCampusFixture(),
    friendStatus: null,
    mutualFriendCount: 0,
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
