import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { AdminQueue } from "./admin-queue";

export const metadata = { title: "Moderation" };

export default async function Admin({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const { report: selectedReportId } = await searchParams;
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/admin");
  const [{ data: roles }, { data: platformRoles }] = await Promise.all([
    db.from("role_assignments").select("role").eq("profile_id", user.id),
    db.from("platform_role_assignments").select("role").eq("profile_id", user.id),
  ]);
  if (!roles?.some(({ role }) => role === "moderator" || role === "admin") && !platformRoles?.length)
    notFound();
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/settings?mfa=required");

  const { data: cases } = await db.rpc("moderation_case_queue", { chosen_status: null, chosen_entity: null, chosen_severity: null, chosen_assignee: null, chosen_organization: null, result_limit: 150 });
  const scope = platformRoles?.length ? "Platform" : "Campus";
  return <AdminQueue initialCases={cases ?? []} scope={scope} {...(selectedReportId ? { initialSelectedId: selectedReportId } : {})} />;
}
