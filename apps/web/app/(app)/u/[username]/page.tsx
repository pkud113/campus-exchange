import Link from "next/link";
import { Bookmark, CheckCircle2, Edit3, LockKeyhole, Plus, UsersRound } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BlockButton } from "./block-button";
import { ProfileExperience } from "./profile-experience";
import { FriendRequestButton } from "@/components/friend-request-button";
import { MessageRequestComposer } from "@/components/message-request-composer";
import { ProfilePosts } from "@/components/profile/profile-posts";
import { profileTabs, type ProfileTabId } from "@/components/profile/profile-tabs";
import { ReportButton } from "@/components/report-button";
import { UserAvatar } from "@/components/user-avatar";
import { encodeCursor } from "@/lib/api";
import { hydrateSocialPosts, type SocialPostRow } from "@/lib/social";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function activeTab(value?: string): ProfileTabId { return profileTabs.some((tab) => tab.id === value) ? value as ProfileTabId : "posts"; }

export default async function PublicProfile({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string; compose?: string }> }) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const tab = activeTab(query.tab);
  const db = await createSupabaseServerClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/u/${username}`)}`);
  const { data: rows } = await db.rpc("safe_profile_by_username", { target_username: username.toLowerCase() }); const profile = rows?.[0]; if (!profile) notFound();
  const own = profile.id === user.id; const displayName = profile.display_name ?? profile.handle;
  const [{ count: blockCount }, { data: postRows }, { data: networkEnabled }] = await Promise.all([
    own ? Promise.resolve({ count: 0 }) : db.from("blocks").select("blocked_id", { count: "exact", head: true }).eq("blocker_id", user.id).eq("blocked_id", profile.id),
    db.rpc("social_feed_filtered", { before_created: null, before_id: null, result_limit: 21, selected_scope: "for_you", target_author: profile.id }),
    db.rpc("network_features_enabled"),
  ]);
  const postPage = ((postRows ?? []) as SocialPostRow[]).slice(0, 20);
  const posts = await hydrateSocialPosts(db, user.id, postPage);
  const lastPost = postPage.at(-1);
  const postsPanel = <ProfilePosts profileId={profile.id} own={own} displayName={displayName} initialPosts={posts} initialCursor={(postRows ?? []).length > 20 && lastPost ? encodeCursor(lastPost.created_at, lastPost.id) : null} networkEnabled={networkEnabled !== false} compose={own && query.compose === "1"} />;
  return <main className="dashboard profile-page">
    <section className="social-profile-header">
      <div className="social-profile-banner">{profile.banner_media_id && <img src={`/api/v1/media/${profile.banner_media_id}?variant=full`} alt="" />}</div>
      <div className="social-profile-identity"><UserAvatar name={displayName} mediaId={profile.avatar_media_id} size="profile" /><div className="social-profile-names"><div><h1>{displayName}</h1>{profile.verified_student && <span title="Verified student"><CheckCircle2 /> Verified student</span>}</div><p>@{profile.handle}</p><small>{profile.campus_name}{profile.academic_field ? ` · ${profile.academic_field}` : ""}{profile.graduation_year ? ` · Class of ${profile.graduation_year}` : ""}</small></div><div className="social-profile-actions">{own ? <><Link className="button button-primary button-small" href="/settings"><Edit3 /> Edit profile</Link><Link className="button button-ghost button-small" href={`/u/${profile.handle}?tab=posts&compose=1#composer`}><Plus /> Create post</Link><Link className="button button-ghost button-small" href="/discussions/saved"><Bookmark /> Saved</Link><Link className="button button-ghost button-small" href="/settings#privacy"><LockKeyhole /> Privacy</Link></> : <><FriendRequestButton profileId={profile.id} initialStatus={profile.relationship_status} requestedBy={profile.relationship_requested_by} viewerId={user.id} /><MessageRequestComposer profileId={profile.id} username={profile.handle} campus={profile.campus_name} label="Message" /><BlockButton profileId={profile.id} initialBlocked={(blockCount ?? 0) > 0} /><ReportButton targetType="profile" targetId={profile.id} /></>}</div></div>
      <div className="social-profile-stats"><span><strong>{profile.post_count}</strong>Posts</span><span><strong>{profile.friend_count}</strong>Friends</span><span><strong>{profile.organization_count}</strong>Organizations</span><span><strong>{profile.listing_count}</strong>Listings</span><span><strong>{profile.event_count}</strong>Events</span></div>
      {profile.bio && <p className="social-profile-bio">{profile.bio}</p>}
      {profile.interests?.length > 0 && <div className="profile-interest-list">{profile.interests.map((interest: string) => <span key={interest}>{interest}</span>)}</div>}
      {!own && profile.mutual_friend_count > 0 && <p className="mutual-context"><UsersRound /> {profile.mutual_friend_count} mutual {profile.mutual_friend_count === 1 ? "friend" : "friends"}</p>}
    </section>
    <ProfileExperience profile={profile} own={own} initialTab={tab} postsPanel={postsPanel} />
  </main>;
}
