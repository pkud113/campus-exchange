import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { AdminQueue } from "./admin-queue";
import { AdminContent } from "./admin-content";
import { AdminProfiles } from "./admin-profiles";

export const metadata = { title: "Moderation" };

export default async function Admin() {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: roles } = await db.from("role_assignments").select("role").eq("profile_id", user!.id);
  if (!roles?.some(({ role }) => role === "moderator" || role === "admin")) notFound();
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/settings?mfa=required");

  const [{ data: reports }, { data: listings }, { data: events }, { data: profiles }] = await Promise.all([
    db.rpc("moderation_report_queue"),
    db.from("listings").select("id,title,profiles!listings_seller_id_fkey(handle,display_name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
    db.from("events").select("id,title,profiles!events_organizer_id_fkey(handle,display_name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
    db.from("profiles").select("id,handle,display_name,status").neq("id", user!.id).not("onboarding_completed_at", "is", null).in("status", ["active", "suspended"]).order("created_at", { ascending: false }).limit(20)
  ]);
  const owner = (value: unknown) => {
    const row = Array.isArray(value) ? value[0] : value;
    return row && typeof row === "object" && "display_name" in row ? String((row as { display_name?: string; handle?: string }).display_name ?? (row as { handle?: string }).handle ?? "Campus member") : "Campus member";
  };
  const content = [
    ...(listings ?? []).map(item => ({ id: item.id, title: item.title, type: "listing" as const, owner: owner(item.profiles) })),
    ...(events ?? []).map(item => ({ id: item.id, title: item.title, type: "event" as const, owner: owner(item.profiles) }))
  ];
  const memberProfiles = (profiles ?? []).filter(profile => profile.handle).map(profile => ({ id: profile.id, username: profile.handle!, displayName: profile.display_name ?? profile.handle!, status: profile.status as "active" | "suspended" }));
  return <><AdminQueue initialReports={reports ?? []}/><main className="dashboard"><AdminContent initialItems={content}/><AdminProfiles initialProfiles={memberProfiles}/></main></>;
}
