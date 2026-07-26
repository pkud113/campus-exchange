import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { AdminConsole } from "./admin-console";
import type { AdminCaseFilters } from "./admin-queue";

export const metadata = { title: "Administration" };
type Params = AdminCaseFilters & { report?: string; section?: string; surface?: string };
export default async function Admin({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams; const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser(); if (!user) redirect("/sign-in?next=/admin");
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel(); if (aal?.currentLevel !== "aal2") redirect("/settings?mfa=required");
  const { data: context, error } = await db.rpc("staff_access_context"); if (error || !context) notFound();
  const allowed = new Set(["overview","institutions","users","staff","cases","content","audit","settings"]);
  const fallback = context.platformRole === "admin" ? "overview" : "cases";
  const initialSection = (params.report ? "cases" : allowed.has(params.section ?? "") ? params.section : fallback) as "overview"|"institutions"|"users"|"staff"|"cases"|"content"|"audit"|"settings";
  const filters: AdminCaseFilters = Object.fromEntries(Object.entries({ status:params.status,severity:params.severity,source:params.source,entity:params.entity,institution:params.institution,campus:params.campus,assignee:params.assignee,automated:params.automated,appeals:params.appeals,q:params.q }).filter((entry):entry is [string,string]=>Boolean(entry[1])));
  const { data: cases } = await db.rpc("admin_case_queue_v3", { status_filter:params.report?null:params.status??null,severity_filter:params.report?null:params.severity??null,source_filter:params.report?null:params.source??null,entity_filter:params.report?null:params.entity??null,institution_filter:params.report?null:params.institution??null,campus_filter:params.report?null:params.campus??null,assignee_filter:params.report?null:params.assignee??null,automated_filter:params.report?null:params.automated==="true"?true:params.automated==="false"?false:null,appeals_filter:params.report?null:params.appeals==="true"?true:params.appeals==="false"?false:null,search_term:params.report?"":params.q??"",after_created:null,after_id:null,result_limit:100 });
  const contentFilters = Object.fromEntries(Object.entries({ q: params.q, surface: params.surface, status: params.status, institution: params.institution }).filter((entry): entry is [string,string] => Boolean(entry[1])));
  return <AdminConsole context={context} initialCases={cases??[]} initialSection={initialSection} caseFilters={filters} contentFilters={contentFilters} {...(params.report?{initialSelectedId:params.report}:{})}/>;
}