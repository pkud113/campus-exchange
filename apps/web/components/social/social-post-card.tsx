"use client";

import { Heart, Lightbulb, MessageCircle, MoreHorizontal, PartyPopper, ShieldPlus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useState } from "react";
import { ConfirmationDialog, Dialog, DropdownMenu } from "../ui-interactive";
import { UserAvatar } from "../user-avatar";
import type { SocialPostView } from "../../lib/social";
import { SocialPostComposer } from "./social-post-composer";
import { SocialReportAction } from "./social-report-action";

const reactionOptions = [
  { id: "like", label: "Like", Icon: Heart },
  { id: "celebrate", label: "Celebrate", Icon: PartyPopper },
  { id: "support", label: "Support", Icon: ShieldPlus },
  { id: "insightful", label: "Insightful", Icon: Lightbulb },
] as const;

function value(record: Record<string, unknown> | null, key: string) { const result = record?.[key]; return typeof result === "string" ? result : null; }

export function SocialPostCard({ initialPost, networkEnabled = true, compact = false, interactive = true, onDeleted }: { initialPost: SocialPostView; networkEnabled?: boolean; compact?: boolean; interactive?: boolean; onDeleted?: (id: string) => void }) {
  const [post, setPost] = useState(initialPost);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const organizationName = value(post.organization, "name");
  const organizationSlug = value(post.organization, "slug");
  const authorHandle = value(post.author, "handle") ?? "member";
  const authorName = organizationName ?? value(post.author, "display_name") ?? authorHandle;
  const avatarId = organizationName ? value(post.organization, "avatar_media_id") : value(post.author, "avatar_media_id");

  async function react(reaction: typeof reactionOptions[number]["id"]) {
    const next = post.viewerReaction === reaction ? null : reaction;
    const previous = post.viewerReaction;
    const delta = next === null ? -1 : previous ? 0 : 1;
    setPost((item) => ({ ...item, viewerReaction: next, reaction_count: Math.max(0, item.reaction_count + delta) }));
    const response = await fetch(`/api/v1/social/posts/${post.id}/reactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reaction: next }) });
    const result = await response.json();
    if (!response.ok) { setPost((item) => ({ ...item, viewerReaction: previous, reaction_count: post.reaction_count })); setStatus(result.error?.message ?? "Unable to update your reaction."); return; }
    setPost((item) => ({ ...item, reaction_count: result.data.count }));
  }

  async function remove() {
    setBusy(true); setStatus("");
    const response = await fetch(`/api/v1/social/posts/${post.id}`, { method: "DELETE" });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) { setStatus(result.error?.message ?? "Unable to delete this post."); return; }
    setConfirmDelete(false); onDeleted?.(post.id);
  }

  return <article className={`social-post-card surface-card surface-card-${compact ? "borderless" : "raised"}`} data-post-id={post.id}>
    <header className="social-post-header">
      <Link href={organizationSlug ? `/organizations/${organizationSlug}` : `/u/${authorHandle}`} aria-label={`View ${authorName}`}><UserAvatar name={authorName} mediaId={avatarId} /></Link>
      <div className="social-post-author"><Link href={organizationSlug ? `/organizations/${organizationSlug}` : `/u/${authorHandle}`}><strong>{authorName}</strong></Link><span>{organizationName ? `Posted by @${authorHandle}` : `@${authorHandle}`} · <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time>{post.edited_at ? " · Edited" : ""}</span></div>
      <span className="ui-badge social-visibility-badge">{post.visibility.replace("_", " ")}</span>
      {interactive && post.canManage && <DropdownMenu label={<><MoreHorizontal aria-hidden="true" /><span className="sr-only">Post options</span></>} items={[{ label: "Edit post", onSelect: () => setEditing(true) }, { label: "Delete post", onSelect: () => setConfirmDelete(true), destructive: true }]} />}
    </header>
    <p className="social-post-body">{post.body}</p>
    {post.media.length > 0 && <div className={`social-post-media social-post-media-${Math.min(post.media.length, 4)}`}>{post.media.map((media) => <img src={`/api/v1/media/${media.id}?variant=full`} alt={media.alt_text} key={media.id} />)}</div>}
    <footer className="social-post-footer">
      {interactive && <div className="social-reactions" aria-label="React to post">{reactionOptions.map(({ id, label, Icon }) => <button type="button" key={id} aria-label={label} aria-pressed={post.viewerReaction === id} className={post.viewerReaction === id ? "active" : ""} onClick={() => react(id)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>}
      <div className="social-post-secondary"><span className="social-reaction-total"><Heart aria-hidden="true" /> {post.reaction_count}</span><Link href={`/social/posts/${post.id}`}><MessageCircle aria-hidden="true" /> {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}</Link>{interactive && !post.canManage && <SocialReportAction targetType="social_post" targetId={post.id} />}</div>
    </footer>
    {status && <p className="form-error social-card-status" role="status">{status}</p>}
    <Dialog open={editing} onClose={() => setEditing(false)} title="Edit post" description="Update your text, audience, or attached images."><SocialPostComposer initialPost={post} networkEnabled={networkEnabled} onCancel={() => setEditing(false)} onSaved={(updated) => { if (updated) setPost(updated); setEditing(false); }} /></Dialog>
    <ConfirmationDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} title="Delete this post?" description="It will disappear immediately and be scheduled for permanent purge after 30 days." confirmLabel="Delete post" destructive busy={busy} />
  </article>;
}
