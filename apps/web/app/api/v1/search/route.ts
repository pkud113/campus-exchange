import { unifiedSearchQuerySchema } from "@campus-exchange/contracts";
import { apiData, apiError, requireVerified } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const parsed = unifiedSearchQuerySchema.safeParse({
    q: url.searchParams.get("q"),
    limit: url.searchParams.get("limit") ?? undefined,
    institution: url.searchParams.get("institution") ?? url.searchParams.get("campus") ?? "my",
    types: url.searchParams.getAll("type").length ? url.searchParams.getAll("type") : undefined
  });
  if (!parsed.success) return apiError(request, 400, "bad_request", "Enter a valid search query.", parsed.error.flatten());
  const { data, error } = await context.supabase.rpc("unified_search_v2", {
    search_term: parsed.data.q,
    institution_filter: parsed.data.institution,
    type_filters: parsed.data.types ?? null,
    before_created: null,
    before_id: null,
    result_limit: parsed.data.limit
  });
  if (error) return apiError(request, 500, "internal_error", "Search is temporarily unavailable.");
  return apiData(request, data ?? []);
}
