import { describe, expect, it } from "vitest";
import {
  countCommentTree,
  dedupeCommentTree,
  discussionCommentRealtimeFilter,
  insertSubmittedComment,
  type DiscussionCommentNode,
} from "./discussion-comments";

const comment = (overrides: Partial<DiscussionCommentNode>): DiscussionCommentNode => ({
  id: "root",
  postId: "post",
  authorId: "author",
  parentCommentId: null,
  depth: 0,
  body: "Root",
  score: 0,
  replyCount: 0,
  removedAt: null,
  deletedAt: null,
  createdAt: "2026-07-15T00:00:00Z",
  ...overrides,
});

describe("discussion comment state", () => {
  it("renders a successful root submission immediately", () => {
    const next = insertSubmittedComment([], comment({ id: "new-root" }));
    expect(next.map((node) => node.id)).toEqual(["new-root"]);
  });

  it("inserts nested replies under the correct parent and updates its count", () => {
    const root = comment({ id: "root", replyCount: 0 });
    const reply = comment({ id: "reply", parentCommentId: "root", depth: 1, body: "Reply" });
    const next = insertSubmittedComment([root], reply, 1);
    expect(next[0]?.replyCount).toBe(1);
    expect(next[0]?.children?.map((node) => node.id)).toEqual(["reply"]);
  });

  it("does not duplicate a comment when POST insertion and Realtime refresh overlap", () => {
    const submitted = comment({ id: "same" });
    const afterPost = insertSubmittedComment([], submitted);
    const afterRealtime = insertSubmittedComment(afterPost, { ...submitted, score: 1 });
    expect(countCommentTree(afterRealtime)).toBe(1);
    expect(afterRealtime[0]?.score).toBe(1);
    expect(dedupeCommentTree([submitted, submitted])).toHaveLength(1);
  });

  it("builds a post-scoped Realtime filter", () => {
    expect(discussionCommentRealtimeFilter("abc")).toBe("post_id=eq.abc");
  });
});
