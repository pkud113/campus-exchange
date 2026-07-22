"use client";

import { RefreshCcw, Send } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, ErrorState, SurfaceCard } from "@/components/ui";
import { SocialPostCard } from "@/components/social/social-post-card";
import { SocialPostComposer } from "@/components/social/social-post-composer";
import type { SocialPostView } from "@/lib/social";

export function ProfilePosts({ profileId, own, displayName, initialPosts, initialCursor, networkEnabled, compose }: {
  profileId: string; own: boolean; displayName: string; initialPosts: SocialPostView[]; initialCursor: string | null; networkEnabled: boolean; compose?: boolean;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function loadMore() {
    if (!cursor) return; setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ author: profileId, scope: "for_you", limit: "20", cursor });
      const response = await fetch(`/api/v1/social/posts?${query}`); const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to load more posts.");
      setPosts((items) => [...items, ...result.data.items]); setCursor(result.data.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load more posts."); }
    finally { setLoading(false); }
  }
  return <div className="profile-posts-layout">
    {own && <SurfaceCard className="profile-post-composer surface-card-accent" id="composer" as="section"><SocialPostComposer networkEnabled={networkEnabled} autoFocus={Boolean(compose)} onSaved={(post) => { if (post?.body) setPosts((items) => [post, ...items]); else window.location.reload(); }} /></SurfaceCard>}
    <div className="profile-post-list">{posts.map((post) => <SocialPostCard initialPost={post} networkEnabled={networkEnabled} key={post.id} onDeleted={(id) => setPosts((items) => items.filter((item) => item.id !== id))} />)}</div>
    {!posts.length && <EmptyState icon={<Send />} title={own ? "Your profile is ready for its first post" : `${displayName} has no visible posts`} description={own ? "Share an update with your campus, friends, or the network using the composer above." : "Posts shared with you will appear here."} />}
    {error && <ErrorState title="More posts could not load" description={error} action={<Button onClick={loadMore}><RefreshCcw /> Retry</Button>} />}
    {cursor && !error && <div className="social-load-more"><Button variant="secondary" busy={loading} onClick={loadMore}>Load more posts</Button></div>}
  </div>;
}
