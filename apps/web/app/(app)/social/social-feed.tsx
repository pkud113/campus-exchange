"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, MessageCircle, Send, UsersRound } from "lucide-react";
import { EmptyState, SurfaceCard } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";

type Post = { id: string; body: string; visibility: string; reaction_count: number; comment_count: number; created_at: string; viewerReaction: string | null; author: { display_name?: string | null; handle?: string; avatar_media_id?: string | null } | null };

export function SocialFeed() {
  const [posts, setPosts] = useState<Post[]>([]); const [loading, setLoading] = useState(true); const [body, setBody] = useState(""); const [visibility, setVisibility] = useState("campus_only"); const [notice, setNotice] = useState(""); const [comment, setComment] = useState<Record<string, string>>({});
  const load = useCallback(async () => { setLoading(true); const response = await fetch("/api/v1/social/posts?limit=30"); const json = await response.json(); setPosts(response.ok ? json.data.items : []); if (!response.ok) setNotice(json.error?.message ?? "Unable to load social posts."); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  async function publish(event: React.FormEvent) { event.preventDefault(); if (!body.trim()) return; setNotice("Publishing…"); const response = await fetch("/api/v1/social/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body, mediaIds: [], visibility, organizationId: null, idempotencyKey: crypto.randomUUID() }) }); const json = await response.json(); if (!response.ok) { setNotice(json.error?.message ?? "Unable to publish."); return; } setBody(""); setNotice("Published."); await load(); }
  async function react(post: Post) { const next = post.viewerReaction ? null : "like"; const response = await fetch(`/api/v1/social/posts/${post.id}/reactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reaction: next }) }); const json = await response.json(); if (response.ok) setPosts((items) => items.map((item) => item.id === post.id ? { ...item, viewerReaction: next, reaction_count: json.data.count } : item)); }
  async function reply(postId: string) { const value = comment[postId]?.trim(); if (!value) return; const response = await fetch(`/api/v1/social/posts/${postId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: value, parentCommentId: null, idempotencyKey: crypto.randomUUID() }) }); if (response.ok) { setComment((values) => ({ ...values, [postId]: "" })); setPosts((items) => items.map((item) => item.id === postId ? { ...item, comment_count: item.comment_count + 1 } : item)); } }
  return <div className="social-layout">
    <SurfaceCard className="social-composer" id="composer">
      <form onSubmit={publish}>
        <label htmlFor="social-body">Share an update</label>
        <textarea id="social-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} placeholder="What should your campus know?" required />
        <div className="composer-footer"><select aria-label="Post audience" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="campus_only">My campus</option><option value="network">Campus Exchange network</option><option value="friends">Friends</option></select><button className="button button-primary"><Send /> Publish</button></div>
      </form>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </SurfaceCard>
    <section className="social-feed" aria-busy={loading} aria-label="Social posts">
      {!loading && !posts.length && <EmptyState icon={<UsersRound />} title="No posts in this audience yet" description="Start a useful campus conversation with the composer above." />}
      {posts.map((post) => <SurfaceCard className="social-post" key={post.id}>
        <header><UserAvatar name={post.author?.display_name ?? post.author?.handle ?? "Campus member"} mediaId={post.author?.avatar_media_id ?? null} /><div><strong>{post.author?.display_name ?? post.author?.handle ?? "Campus member"}</strong><small>@{post.author?.handle ?? "member"} · {new Date(post.created_at).toLocaleString()}</small></div><span className="ui-badge">{post.visibility.replace("_", " ")}</span></header>
        <p>{post.body}</p>
        <div className="social-actions"><button type="button" className={post.viewerReaction ? "active" : ""} onClick={() => react(post)} aria-pressed={Boolean(post.viewerReaction)}><Heart /> {post.reaction_count}</button><span><MessageCircle /> {post.comment_count}</span></div>
        <div className="inline-comment"><input aria-label="Add a comment" value={comment[post.id] ?? ""} onChange={(event) => setComment((values) => ({ ...values, [post.id]: event.target.value }))} placeholder="Add a comment" maxLength={4000}/><button type="button" aria-label="Send comment" onClick={() => reply(post.id)}><Send /></button></div>
      </SurfaceCard>)}
    </section>
  </div>;
}
