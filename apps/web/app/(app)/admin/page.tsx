import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { AdminConsole } from "./admin-console";

export const metadata = { title: "Administration" };

export default async function Admin({ searchParams }: { searchParams: Promise<{ report?: string; section?: string }> }) {
  const { report: selectedReportId, section } = await searchParams;
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/admin");
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/settings?mfa=required");
  const [{ data: context, error }, { data: cases }] = await Promise.all([
    db.rpc("staff_access_context"),
    db.rpc("moderation_case_queue", { chosen_status: null, chosen_entity: null, chosen_severity: null, chosen_assignee: null, chosen_organization: null, result_limit: 150 })
  ]);
  if (error || !context) notFound();
  const allowed = new Set(["overview","institutions","users","staff","cases","content","audit","settings"]);
  const initialSection = (selectedReportId ? "cases" : allowed.has(section ?? "") ? section : "overview") as "overview" | "institutions" | "users" | "staff" | "cases" | "content" | "audit" | "settings";
  return <AdminConsole context={context} initialCases={cases ?? []} initialSection={initialSection} {...(selectedReportId ? { initialSelectedId: selectedReportId } : {})} />;
}
