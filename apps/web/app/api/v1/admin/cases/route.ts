import { apiData, apiError, requireStaffCapability } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "cases.read"); if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  if (url.searchParams.get("v") !== "2") {
    const { data, error } = await context.supabase.rpc("moderation_case_queue", {
      chosen_status: url.searchParams.get("status") || null,
      chosen_entity: url.searchParams.get("entity") || null,
      chosen_severity: url.searchParams.get("severity") || null,
      chosen_assignee: url.searchParams.get("assignee") || null,
      chosen_organization: url.searchParams.get("organization") || null,
      result_limit: Math.min(Number(url.searchParams.get("limit") || 100), 200)
    });
    return error ? apiError(request, 403, "forbidden", "Unable to load the moderation queue.") : apiData(request, data ?? []);
  }
  const cursor = url.searchParams.get("cursor")?.split("|");
  const { data, error } = await context.supabase.rpc("admin_case_queue_v2", {
    status_filter: url.searchParams.get("status") || null,
    severity_filter: url.searchParams.get("severity") || null,
    institution_filter: url.searchParams.get("institution") || null,
    entity_filter: url.searchParams.get("entity") || null,
    assignee_filter: url.searchParams.get("assignee") || null,
    after_created: cursor?.[0] || null,
    after_id: cursor?.[1] || null,
    result_limit: Math.min(Number(url.searchParams.get("limit") || 50), 100),
  });
  return error ? apiError(request, 403, "forbidden", "Unable to load the moderation queue.") : apiData(request, data ?? []);
}
