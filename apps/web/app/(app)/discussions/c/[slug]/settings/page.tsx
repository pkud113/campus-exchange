import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { CommunityDeleteButton } from "@/components/discussions/community-danger-zone";
import { CommunitySettingsForm } from "@/components/discussions/community-settings-form";
import { OwnershipTransfer } from "@/components/discussions/ownership-transfer";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CommunitySettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data: community } = await db.from("discussion_communities").select("*").eq("slug", slug).maybeSingle();
  if (!community) notFound();
  const { data: owner } = await db.from("discussion_memberships").select("role,state").eq("community_id", community.id).eq("profile_id", user.id).maybeSingle();
  if (owner?.role !== "owner" || owner.state !== "active") notFound();
  const { data: members } = await db.from("discussion_memberships").select("profile_id,profiles!discussion_memberships_profile_id_fkey(handle,display_name)").eq("community_id", community.id).eq("state", "active").neq("profile_id", user.id).limit(200);
  const options = (members ?? []).flatMap((row) => { const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; return profile ? [{ id: row.profile_id, label: profile.display_name ?? profile.handle }] : []; });
  return <main className="dashboard narrow"><Link className="back-link" href={`/discussions/c/${slug}`}><ArrowLeft/>Back to community</Link><div className="form-header"><span className="overline">OWNER SETTINGS</span><h1>Manage {community.display_name}.</h1></div><CommunitySettingsForm community={community as never}/><section className="dashboard-panel danger-zone"><OwnershipTransfer slug={slug} members={options}/><h2>Delete community</h2><p>Deletion immediately disables participation and schedules content/media cleanup after 30 days. The slug stays reserved.</p><CommunityDeleteButton slug={slug}/></section></main>;
}
