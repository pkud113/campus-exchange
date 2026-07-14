import { describe, expect, it } from "vitest";
import { discussionCommentInputSchema, discussionCommunityInputSchema, discussionFeedQuerySchema, discussionModerationSchema, discussionOwnershipSchema, discussionPostInputSchema, discussionVoteSchema, reportInputSchema } from "./index";

const key = "11111111-1111-4111-8111-111111111111";
describe("discussion API contracts", () => {
  it("normalizes valid immutable slugs and rejects unsupported syntax", () => {
    expect(discussionCommunityInputSchema.parse({ slug: "Campus_Life", displayName: "Campus Life", idempotencyKey: key }).slug).toBe("campus_life");
    expect(() => discussionCommunityInputSchema.parse({ slug: "campus-life", displayName: "Campus Life", idempotencyKey: key })).toThrow();
  });
  it("validates text, link, and image post invariants", () => {
    expect(discussionPostInputSchema.safeParse({ postType: "text", title: "Hello", body: "Campus", idempotencyKey: key }).success).toBe(true);
    expect(discussionPostInputSchema.safeParse({ postType: "link", title: "Useful link", linkUrl: "https://example.com", idempotencyKey: key }).success).toBe(true);
    expect(discussionPostInputSchema.safeParse({ postType: "image", title: "Photo", mediaId: key, idempotencyKey: key }).success).toBe(true);
    expect(discussionPostInputSchema.safeParse({ postType: "link", title: "Unsafe", linkUrl: "http://example.com", idempotencyKey: key }).success).toBe(false);
    expect(discussionPostInputSchema.safeParse({ postType: "image", title: "Missing", idempotencyKey: key }).success).toBe(false);
  });
  it("accepts typed cursors and all feed sorts", () => {
    for (const sort of ["hot", "new", "top", "comments"]) expect(discussionFeedQuerySchema.parse({ sort, limit: "25" })).toMatchObject({ sort, limit: 25 });
  });
  it("limits vote values and comment fields", () => {
    expect(discussionVoteSchema.safeParse({ value: -1 }).success).toBe(true);
    expect(discussionVoteSchema.safeParse({ value: null }).success).toBe(true);
    expect(discussionVoteSchema.safeParse({ value: 0 }).success).toBe(false);
    expect(discussionCommentInputSchema.safeParse({ body: "Reply", parentCommentId: null, idempotencyKey: key }).success).toBe(true);
  });
  it("validates audited moderation and ownership payloads", () => {
    expect(discussionModerationSchema.safeParse({ action: "ban_member", targetType: "member", targetId: key, reason: "Repeated abuse", idempotencyKey: key }).success).toBe(true);
    expect(discussionOwnershipSchema.safeParse({ newOwnerId: key, reason: "Club leadership transition", idempotencyKey: key }).success).toBe(true);
  });
  it("allows protected discussion report targets", () => {
    for (const targetType of ["community", "discussion_post", "discussion_comment"]) expect(reportInputSchema.safeParse({ targetType, targetId: key, reason: "spam", details: "review", idempotencyKey: key }).success).toBe(true);
  });
});
