import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SocialPostCard } from "./social-post-card";
import type { SocialPostView } from "../../lib/social";

const post: SocialPostView = {
  id: "00000000-0000-4000-8000-000000000001", author_profile_id: "00000000-0000-4000-8000-000000000002", organization_id: null,
  body: "Accessible campus update", visibility: "campus_only", reaction_count: 2, comment_count: 1, created_at: "2026-07-22T00:00:00.000Z", edited_at: null,
  author: { handle: "student", display_name: "Student", avatar_media_id: null }, organization: null,
  media: [{ id: "00000000-0000-4000-8000-000000000003", alt_text: "Students assembling a robot", position: 0 }], viewerReaction: null, canManage: true,
};

describe("social post card", () => {
  it("renders connected post metadata, media, reactions, and comments", () => {
    const markup = renderToStaticMarkup(<SocialPostCard initialPost={post} />);
    expect(markup).toContain("Accessible campus update");
    expect(markup).toContain('alt="Students assembling a robot"');
    expect(markup).toContain('aria-label="Celebrate"');
    expect(markup).toContain(`/social/posts/${post.id}`);
    expect(markup).toContain("Post options");
  });
});
