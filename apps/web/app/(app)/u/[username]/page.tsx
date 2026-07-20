import Link from "next/link";
import { Bookmark, CheckCircle2, Edit3, LockKeyhole, Plus, UsersRound } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BlockButton } from "./block-button";
import { ProfileExperience } from "./profile-experience";
import { FriendRequestButton } from "@/components/friend-request-button";
import { MessageRequestComposer } from "@/components/message-request-composer";
import { ReportButton } from "@/components/report-button";
import { UserAvatar } from "@/components/user-avatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params; const db = await createSupabaseServerClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/u/${username}`)}`);
  const { data: rows } = await db.rpc("safe_profile_by_username", { target_username: username.toLowerCase() }); const profile = rows?.[0]; if (!profile) notFound();
  const own = profile.id === user.id; const displayName = profile.display_name ?? profile.handle;
  return <main className="dashboard profile-page">
    <section className="social-profile-header">
      <div className="social-profile-banner">{profile.banner_media_id && <img src={`/api/v1/media/${profile.banner_media_id}?variant=full`} alt="" />}</div>
      <div className="social-profile-identity"><UserAvatar name={displayName} mediaId={profile.avatar_media_id} size="profile" /><div className="social-profile-names"><div><h1>{displayName}</h1>{profile.verified_student && <span title="Verified student"><CheckCircle2 /> Verified student</span>}</div><p>@{profile.handle}</p><small>{profile.campus_name}{profile.academic_field ? ` · ${profile.academic_field}` : ""}{profile.graduation_year ? ` · Class of ${profile.graduation_year}` : ""}</small></div><div className="social-profile-actions">{own ? <><Link className="button button-primary button-small" href="/settings"><Edit3 /> Edit profile</Link><Link className="button button-ghost button-small" href="/social#composer"><Plus /> Create post</Link><Link className="button button-ghost button-small" href="/discussions/saved"><Bookmark /> Saved</Link><Link className="button button-ghost button-small" href="/settings#privacy"><LockKeyhole /> Privacy</Link></> : <><FriendRequestButton profileId={profile.id} initialStatus={profile.relationship_status} requestedBy={profile.relationship_requested_by} viewerId={user.id} /><MessageRequestComposer profileId={profile.id} username={profile.handle} campus={profile.campus_name} label="Message" /><BlockButton profileId={profile.id} initialBlocked={false} /><ReportButton targetType="profile" targetId={profile.id} /></>}</div></div>
      <div className="social-profile-stats"><span><strong>{profile.post_count}</strong>Posts</span><span><strong>{profile.friend_count}</strong>Friends</span><span><strong>{profile.organization_count}</strong>Organizations</span><span><strong>{profile.listing_count}</strong>Listings</span><span><strong>{profile.event_count}</strong>Events</span></div>
      {profile.bio && <p className="social-profile-bio">{profile.bio}</p>}
      {profile.interests?.length > 0 && <div className="profile-interest-list">{profile.interests.map((interest: string) => <span key={interest}>{interest}</span>)}</div>}
      {!own && profile.mutual_friend_count > 0 && <p className="mutual-context"><UsersRound /> {profile.mutual_friend_count} mutual {profile.mutual_friend_count === 1 ? "friend" : "friends"}</p>}
    </section>
    <ProfileExperience profile={profile} own={own} />
  </main>;
}
