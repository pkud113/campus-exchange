import { apiData, apiError, requireStaff } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireStaff(request); if (context instanceof NextResponse) return context;
  const url = new URL(request.url); const assignee = url.searchParams.get("assignee"); const organization = url.searchParams.get("organization");
  const { data, error } = await context.supabase.rpc("moderation_case_queue", {
    chosen_status: url.searchParams.get("status") || null,
    chosen_entity: url.searchParams.get("entity") || null,
    chosen_severity: url.searchParams.get("severity") || null,
    chosen_assignee: assignee || null,
    chosen_organization: organization || null,
    result_limit: Math.min(Number(url.searchParams.get("limit") || 100), 200),
  });
  return error ? apiError(request, 403, "forbidden", "Unable to load the moderation queue.") : apiData(request, data ?? []);
}
