import Link from "next/link";
import { ArrowLeft, ExternalLink, Lock, Pin } from "lucide-react";
import { notFound } from "next/navigation";
import { CommentsClient } from "@/components/discussions/comments-client";
import { DiscussionSave } from "@/components/discussions/discussion-actions";
import { DiscussionReport } from "@/components/discussions/discussion-report";
import { DiscussionVote } from "@/components/discussions/discussion-vote";
import { PostModerationActions } from "@/components/discussions/post-moderation-actions";
import { PostOwnerActions } from "@/components/discussions/post-owner-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;
export default async function DiscussionPostPage({ params }: { params: Promise<{ slug: string; postId: string }> }) {
  const { slug, postId } = await params;
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data: post } = await db.from("discussion_posts").select("*,discussion_communities!inner(id,slug,display_name,status,comments_enabled),profiles!discussion_posts_author_id_fkey(handle,display_name,avatar_media_id)").eq("id", postId).maybeSingle();
  if (!post) notFound();
  const community = one(post.discussion_communities);
  const author = one(post.profiles);
  if (!community || community.slug !== slug) notFound();
  const [{ data: vote }, { data: saved }, { data: membership }] = await Promise.all([
    db.from("discussion_post_votes").select("value").eq("post_id", post.id).eq("profile_id", user.id).maybeSingle(),
    db.from("discussion_saved_posts").select("post_id").eq("post_id", post.id).eq("profile_id", user.id).maybeSingle(),
    db.from("discussion_memberships").select("role,state").eq("community_id", community.id).eq("profile_id", user.id).maybeSingle()
  ]);
  const moderator = membership?.state === "active" && ["owner", "moderator"].includes(membership.role);
  const locked = Boolean(post.locked_at || post.removed_at || post.deleted_at || community.status !== "active" || !community.comments_enabled);
  return <main className="dashboard discussion-detail">
    <Link className="back-link" href={`/discussions/c/${community.slug}`}><ArrowLeft/>Back to {community.display_name}</Link>
    <article className="discussion-detail-card">
      <DiscussionVote targetType="posts" targetId={post.id} initialScore={post.score} initialVote={(vote?.value ?? 0) as -1 | 0 | 1}/>
      <div className="discussion-detail-copy">
        <div className="discussion-post-meta"><Link className="community-label" href={`/discussions/c/${community.slug}`}>c/{community.slug}</Link><span>{author?.display_name ?? author?.handle ?? "Deleted member"}</span><span>{new Date(post.created_at).toLocaleString()}</span>{post.is_pinned && <span><Pin/>Pinned</span>}{post.locked_at && <span><Lock/>Locked</span>}</div>
        <h1>{post.deleted_at ? "[deleted]" : post.title}</h1>
        {post.removed_at ? <p className="discussion-notice">This post was removed by a moderator.</p> : post.deleted_at ? <p>[deleted]</p> : <>{post.body && <div className="discussion-body">{post.body}</div>}{post.post_type === "image" && post.media_id && <img className="discussion-detail-image" src={`/api/v1/media/${post.media_id}?variant=hero`} alt="Discussion attachment"/>}{post.post_type === "link" && post.link_url && <a className="discussion-external-link" href={post.link_url} target="_blank" rel="noreferrer"><ExternalLink/>Open shared link</a>}</>}
        <div className="discussion-detail-actions"><DiscussionSave postId={post.id} initialSaved={Boolean(saved)}/><DiscussionReport targetType="discussion_post" targetId={post.id}/></div>
        {post.author_id === user.id && !post.deleted_at && (
          <PostOwnerActions postId={post.id} slug={community.slug} post={{ title: post.title, body: post.body, link_url: post.link_url }}/>
        )}
        {moderator && (
          <PostModerationActions slug={community.slug} postId={post.id} pinned={post.is_pinned} locked={Boolean(post.locked_at)} removed={Boolean(post.removed_at)}/>
        )}
      </div>
    </article>
    <CommentsClient postId={post.id} currentUser={user.id} locked={locked}/>
  </main>;
}
