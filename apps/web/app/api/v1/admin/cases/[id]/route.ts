import { apiData, apiError, requireStaff } from "@/lib/api";
import { NextResponse } from "next/server";
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireStaff(request); if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: selected, error } = await context.supabase.from("moderation_cases").select("*").eq("id", id).single();
  if (error || !selected) return apiError(request, 404, "not_found", "Moderation case not found.");
  const [{ data: report }, { data: events }, { data: actions }, { data: appeals }] = await Promise.all([
    context.supabase.from("reports").select("id,reporter_id,target_type,target_id,reason,details,message_snapshot,content_snapshot,status,created_at,resolved_at").eq("id", selected.report_id).single(),
    context.supabase.from("moderation_case_events").select("id,actor_id,event_type,note,internal,metadata,created_at").eq("case_id", id).order("created_at"),
    context.supabase.from("moderation_actions").select("id,moderator_id,action,reason,reversible,reversed_at,metadata,created_at").eq("case_id", id).order("created_at"),
    context.supabase.from("moderation_appeals").select("id,appellant_id,statement,status,assigned_to,resolution,created_at,resolved_at").eq("case_id", id).order("created_at"),
  ]);
  const profileIds = [report?.reporter_id, selected.assigned_to, ...(events ?? []).map((item) => item.actor_id), ...(actions ?? []).map((item) => item.moderator_id)].filter(Boolean) as string[];
  const { data: profiles } = profileIds.length ? await context.supabase.rpc("safe_profile_cards", { target_ids: [...new Set(profileIds)] }) : { data: [] };
  return apiData(request, { case: selected, report, events: events ?? [], actions: actions ?? [], appeals: appeals ?? [], profiles: profiles ?? [] });
}
