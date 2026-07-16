import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Plus, Settings, ShieldCheck, Users } from "lucide-react";
import type { DiscussionSort } from "@campus-exchange/contracts";
import { DiscussionPostCard, type DiscussionPostRow } from "@/components/discussions/discussion-post-card";
import { CommunityJoinButton } from "@/components/discussions/discussion-actions";
import { DiscussionReport } from "@/components/discussions/discussion-report";
import { decodeDiscussionCursor, discussionCursorFor } from "@/lib/discussions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CommunityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string; cursor?: string }> }) {
  const { slug } = await params;
  const { sort: rawSort, cursor: rawCursor } = await searchParams;
  const sort: DiscussionSort = ["hot", "new", "top", "comments"].includes(rawSort ?? "") ? rawSort as DiscussionSort : "hot";
  const cursor = decodeDiscussionCursor(rawCursor);
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data: community } = await db.from("discussion_communities").select("*").eq("slug", slug.toLowerCase()).maybeSingle();
  if (!community) notFound();
  const [{ data: membership }, { data: moderators }, { data: roles }, { data: aal }] = await Promise.all([
    db.from("discussion_memberships").select("role,state").eq("community_id", community.id).eq("profile_id", user.id).maybeSingle(),
    db.from("discussion_memberships").select("role,profiles!discussion_memberships_profile_id_fkey(id,handle,display_name,avatar_media_id)").eq("community_id", community.id).eq("state", "active").in("role", ["owner", "moderator"]),
    db.from("role_assignments").select("role").eq("profile_id", user.id).in("role", ["moderator", "admin"]),
    db.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  const limit = 20;
  let regularQuery = db.from("discussion_posts").select("*,profiles!discussion_posts_author_id_fkey(handle,display_name)").eq("community_id", community.id).eq("is_pinned", false).is("deleted_at", null).is("removed_at", null).limit(limit + 1);
  if (sort === "new") regularQuery = regularQuery.order("created_at", { ascending: false }).order("id", { ascending: false });
  else if (sort === "top") regularQuery = regularQuery.order("score", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
  else if (sort === "comments") regularQuery = regularQuery.order("comment_count", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
  else regularQuery = regularQuery.order("hot_rank", { ascending: false }).order("id", { ascending: false });
  if (cursor?.sort === sort) {
    if (sort === "new") regularQuery = regularQuery.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    else if (sort === "top") regularQuery = regularQuery.or(`score.lt.${cursor.value},and(score.eq.${cursor.value},created_at.lt.${cursor.createdAt}),and(score.eq.${cursor.value},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    else if (sort === "comments") regularQuery = regularQuery.or(`comment_count.lt.${cursor.value},and(comment_count.eq.${cursor.value},created_at.lt.${cursor.createdAt}),and(comment_count.eq.${cursor.value},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    else regularQuery = regularQuery.or(`hot_rank.lt.${cursor.value},and(hot_rank.eq.${cursor.value},id.lt.${cursor.id})`);
  }
  const [regularResult, pinnedResult] = await Promise.all([
    regularQuery,
    rawCursor ? Promise.resolve({ data: [] }) : db.from("discussion_posts").select("*,profiles!discussion_posts_author_id_fkey(handle,display_name)").eq("community_id", community.id).eq("is_pinned", true).is("deleted_at", null).is("removed_at", null).order("created_at", { ascending: false }).limit(5)
  ]);
  const regularRows = regularResult.data ?? [];
  const visibleRegular = regularRows.slice(0, limit);
  const rawPosts = [...(pinnedResult.data ?? []), ...visibleRegular];
  const ids = rawPosts.map((post) => post.id);
  const [votes, saves] = ids.length ? await Promise.all([
    db.from("discussion_post_votes").select("post_id,value").eq("profile_id", user.id).in("post_id", ids),
    db.from("discussion_saved_posts").select("post_id").eq("profile_id", user.id).in("post_id", ids)
  ]) : [{ data: [] }, { data: [] }];
  const voteMap = new Map((votes.data ?? []).map((vote) => [vote.post_id, vote.value]));
  const saveSet = new Set((saves.data ?? []).map((save) => save.post_id));
  const posts = rawPosts.map((post) => ({ ...post, discussion_communities: { slug: community.slug, display_name: community.display_name }, viewer_vote: voteMap.get(post.id) ?? 0, viewer_saved: saveSet.has(post.id) }));
  const last = visibleRegular.at(-1);
  const nextCursor = regularRows.length > limit && last ? discussionCursorFor(last, sort) : null;
  const active = membership?.state === "active";
  const isOwner = active && membership.role === "owner";
  const isModerator = active && (membership.role === "owner" || membership.role === "moderator");
  const staffModerator = Boolean(roles?.length && aal?.currentLevel === "aal2");
  const canPost = community.status === "active" && active && (community.posting_permission === "members" || (community.posting_permission === "moderators" && isModerator) || (community.posting_permission === "owner" && isOwner));

  return <main className="dashboard community-page">
    <section className="community-hero">{community.banner_media_id && <img className="community-banner" src={`/api/v1/media/${community.banner_media_id}?variant=full`} alt=""/>}<div className="community-heading"><span className="community-icon">{community.icon_media_id ? <img src={`/api/v1/media/${community.icon_media_id}?variant=thumb`} alt=""/> : community.display_name.slice(0, 1)}</span><div><span className="overline">c/{community.slug}</span><h1>{community.display_name}</h1><p>{community.description || "A private community for this campus."}</p><div className="community-stats"><span><Users/>{community.member_count} members</span><span>{community.post_count} posts</span>{community.status !== "active" && <span><Lock/>{community.status}</span>}</div></div><div className="community-actions"><CommunityJoinButton slug={community.slug} initialJoined={active} owner={isOwner}/>{canPost && <Link className="button button-primary" href={`/discussions/c/${community.slug}/submit`}><Plus/>Create post</Link>}{isOwner && <Link className="button button-ghost" href={`/discussions/c/${community.slug}/settings`}><Settings/>Settings</Link>}{(isModerator || staffModerator) && <Link className="button button-ghost" href={`/discussions/c/${community.slug}/moderation`}><ShieldCheck/>Moderation</Link>}</div></div></section>
    {community.status !== "active" && <p className="discussion-notice">This community is {community.status}. New participation is disabled.</p>}
    <div className="community-layout"><section className="discussion-feed"><nav className="discussion-sort" aria-label="Post sorting">{(["hot", "new", "top", "comments"] as const).map((value) => <Link className={sort === value ? "active" : ""} href={`/discussions/c/${community.slug}?sort=${value}`} key={value}>{value === "comments" ? "Most commented" : value}</Link>)}</nav>{posts.length ? posts.map((post) => <DiscussionPostCard key={post.id} post={post as DiscussionPostRow}/>) : <div className="empty-state"><Plus/><h2>No posts yet</h2><p>{canPost ? "Start the first conversation." : "Join this community to participate."}</p></div>}{nextCursor && <Link className="button button-ghost button-wide" href={`/discussions/c/${community.slug}?sort=${sort}&cursor=${encodeURIComponent(nextCursor)}`}>Load older posts</Link>}</section><aside className="discussion-sidebar"><section className="community-list-card"><h2>Community rules</h2><div className="community-rules">{community.rules || "Be respectful and keep conversations useful to the campus community."}</div></section><section className="community-list-card"><h2>Moderators</h2>{(moderators ?? []).map((row) => { const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; return profile ? <Link key={profile.id} href={`/u/${profile.handle}`}><strong>{profile.display_name ?? profile.handle}</strong><small>{row.role}</small></Link> : null; })}</section><DiscussionReport targetType="community" targetId={community.id}/></aside></div>
  </main>;
}
