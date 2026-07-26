import { adminCaseQuerySchema } from "@campus-exchange/contracts";
import { apiData, apiError, requireStaffCapability } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "cases.read");
  if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const parsed = adminCaseQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Invalid moderation queue filters.");
  const cursor = parsed.data.cursor?.split("|");
  const { data, error } = await context.supabase.rpc("admin_case_queue_v3", {
    status_filter: parsed.data.status ?? null, severity_filter: parsed.data.severity ?? null, source_filter: parsed.data.source ?? null,
    entity_filter: parsed.data.entity ?? null, institution_filter: parsed.data.institution ?? null, campus_filter: parsed.data.campus ?? null,
    assignee_filter: parsed.data.assignee ?? null, automated_filter: parsed.data.automated ?? null, appeals_filter: parsed.data.appeals ?? null,
    search_term: parsed.data.q, after_created: cursor?.[0] ?? null, after_id: cursor?.[1] ?? null, result_limit: parsed.data.limit
  });
  return error ? apiError(request, 403, "forbidden", "Unable to load the moderation queue.") : apiData(request, data ?? []);
}
