import { adminContentActionSchema, adminContentQuerySchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, mutationError, parseJson, requireStaffCapability, verifyMutationOrigin } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "content.read");
  if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const parsed = adminContentQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Invalid content filters.");
  const cursor = parsed.data.cursor?.split("|");
  const { data, error } = await context.supabase.rpc("admin_content_directory", {
    search_term: parsed.data.q, surface_filter: parsed.data.surface ?? null, status_filter: parsed.data.status ?? null,
    institution_filter: parsed.data.institution ?? null, after_created: cursor?.[0] ?? null, after_id: cursor?.[1] ?? null, result_limit: parsed.data.limit
  });
  return error ? apiError(request, 403, "forbidden", "Unable to load scoped content.") : apiData(request, data ?? []);
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireStaffCapability(request, "content.act");
  if (context instanceof NextResponse) return context;
  const input = await parseJson(request, adminContentActionSchema);
  if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("apply_admin_content_action", {
    selected_action: input.action, selected_target_type: input.targetType, selected_target_id: input.targetId,
    submitted_reason: input.reason, request_key: input.idempotencyKey
  });
  return error ? mutationError(request, error, "Unable to apply the audited content action.") : apiData(request, { operationalCaseId: data });
}
