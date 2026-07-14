import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ModerationClient } from "@/components/discussions/moderation-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DiscussionModeration({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data: community } = await db.from("discussion_communities").select("id,display_name,status").eq("slug", slug).maybeSingle();
  if (!community) notFound();
  const [{ data: membership }, { data: roles }, { data: aal }] = await Promise.all([
    db.from("discussion_memberships").select("role,state").eq("community_id", community.id).eq("profile_id", user.id).maybeSingle(),
    db.from("role_assignments").select("role").eq("profile_id", user.id).in("role", ["moderator", "admin"]),
    db.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  const communityModerator = membership?.state === "active" && ["owner", "moderator"].includes(membership.role);
  const staffModerator = Boolean(roles?.length && aal?.currentLevel === "aal2");
  if (!communityModerator && !staffModerator) notFound();
  return <main className="dashboard"><Link className="back-link" href={`/discussions/c/${slug}`}><ArrowLeft/>Back to community</Link><div className="page-title"><span className="overline">COMMUNITY SAFETY</span><h1>Moderate {community.display_name}.</h1><p>Member actions, reported content, removed content, and append-only audit history.</p></div><ModerationClient slug={slug} communityId={community.id} isOwner={membership?.role === "owner"} communityStatus={community.status}/></main>;
}
