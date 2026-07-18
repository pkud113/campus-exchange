import { institutionSearchSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimit } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = institutionSearchSchema.safeParse({ q: url.searchParams.get("q") ?? "", limit: url.searchParams.get("limit") ?? 20 });
  if (!parsed.success) return apiError(request, 400, "bad_request", "Check the institution search query.", parsed.error.flatten());
  const clientAddress = request.headers.get("cf-connecting-ip") ?? "local";
  const limited = await enforceRateLimit(request, "institution-search", clientAddress, 120, 60); if (limited) return limited;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("search_institution_directory", {
      search_query: parsed.data.q,
      result_limit: parsed.data.limit
    });
    if (error) throw error;
    return apiData(request, (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      region: row.region,
      status: row.status,
      registrationStatus: row.registration_status,
      availability: row.availability
    })));
  } catch {
    return apiError(request, 503, "service_unconfigured", "The college directory is temporarily unavailable.");
  }
}
