import { unifiedSearchQuerySchema } from "@campus-exchange/contracts";
import { apiData, apiError, requireVerified } from "@/lib/api";
import { NextResponse } from "next/server";

type SearchHit = { kind: string; campus_slug: string; [key: string]: unknown };

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const parsed = unifiedSearchQuerySchema.safeParse({ q: url.searchParams.get("q"), limit: url.searchParams.get("limit") ?? undefined, campus: url.searchParams.get("campus") ?? undefined, types: url.searchParams.getAll("type").length ? url.searchParams.getAll("type") : undefined });
  if (!parsed.success) return apiError(request, 400, "bad_request", "Enter a valid search query.", parsed.error.flatten());
  const { data, error } = await context.supabase.rpc("unified_search", { search_term: parsed.data.q, result_limit: parsed.data.limit });
  if (error) return apiError(request, 500, "internal_error", "Search is temporarily unavailable.");
  let results = (data ?? []) as SearchHit[];
  if (parsed.data.types?.length) results = results.filter((item) => parsed.data.types?.includes(item.kind as "profile" | "listing" | "organization" | "event" | "community" | "social_post"));
  if (parsed.data.campus) results = results.filter((item) => item.campus_slug === parsed.data.campus);
  return apiData(request, results);
}
