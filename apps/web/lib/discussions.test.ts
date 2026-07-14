import { describe, expect, it } from "vitest";
import { buildCommentTree, decodeDiscussionCursor, discussionCursorFor } from "./discussions";

describe("discussion cursors", () => {
  it("round trips a typed hot cursor", () => {
    const encoded = discussionCursorFor({ id: "11111111-1111-4111-8111-111111111111", created_at: "2026-07-14T00:00:00Z", hot_rank: 42, score: 3, comment_count: 2 }, "hot");
    expect(decodeDiscussionCursor(encoded)).toMatchObject({ sort: "hot", value: "42" });
  });
  it("rejects malformed cursors", () => expect(decodeDiscussionCursor("nope")).toBeNull());
});

describe("comment trees", () => {
  it("builds nested replies without additional queries", () => {
    const base = { postId: "p", authorId: "a", depth: 0, body: "body", score: 0, replyCount: 0, removedAt: null, deletedAt: null, createdAt: "2026-07-14T00:00:00Z" };
    const tree = buildCommentTree([
      { ...base, id: "root", parentCommentId: null },
      { ...base, id: "reply", parentCommentId: "root", depth: 1 }
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children?.[0]?.id).toBe("reply");
  });
});
