import { describe, expect, it } from "vitest";
import { expandedProfileInputSchema, friendRequestInputSchema, notificationCategorySchema, organizationInputSchema, registrationOutcomeSchema, socialPostInputSchema, unifiedSearchQuerySchema } from "./index";

const id = "00000000-0000-4000-8000-000000000001";

describe("V1 foundation contracts", () => {
  it("validates privacy-aware expanded profiles", () => {
    const profile = expandedProfileInputSchema.parse({
      displayName: "Ada Student",
      biography: "Computer science student",
      academicField: "Computer Science",
      graduationYear: 2028,
      graduationYearVisible: false,
      academicFieldVisible: true,
      interests: ["Robotics", "robotics"],
      visibility: "campus_only",
      friendListVisibility: "friends",
      organizationMembershipVisibility: "campus_only",
      activityVisibility: "campus_only",
    });
    expect(profile.interests).toEqual(["robotics"]);
  });

  it("requires idempotency for relationship and organization writes", () => {
    expect(friendRequestInputSchema.parse({ profileId: id, idempotencyKey: id }).profileId).toBe(id);
    expect(() => organizationInputSchema.parse({ slug: "robotics-club", name: "Robotics Club", description: "Build robots with students.", visibility: "campus_only", membershipPolicy: "open", websiteUrl: null })).toThrow();
  });

  it("bounds social media and unified search", () => {
    expect(socialPostInputSchema.parse({ body: "Hello campus", mediaIds: [], visibility: "friends", organizationId: null, idempotencyKey: id }).visibility).toBe("friends");
    expect(unifiedSearchQuerySchema.parse({ q: "robotics", types: ["profile", "organization"] }).limit).toBe(20);
  });

  it("shares the complete V1 notification taxonomy", () => {
    expect(notificationCategorySchema.options).toContain("security_activity");
    expect(notificationCategorySchema.options).toHaveLength(13);
  });

  it("uses stable machine-readable registration outcomes", () => {
    expect(registrationOutcomeSchema.parse("AMBIGUOUS_OR_SHARED_DOMAIN")).toBe("AMBIGUOUS_OR_SHARED_DOMAIN");
    expect(registrationOutcomeSchema.options).toHaveLength(10);
  });
});
