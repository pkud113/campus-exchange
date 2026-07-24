import { institutionSearchSchema } from "@campus-exchange/contracts";
import { apiData, apiError, enforceRateLimit } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = institutionSearchSchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    lifecycle: url.searchParams.get("lifecycle") ?? "active",
    presence: url.searchParams.get("presence") ?? "any",
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? 20
  });
  if (!parsed.success) return apiError(request, 400, "bad_request", "Check the institution search query.", parsed.error.flatten());
  const clientAddress = request.headers.get("cf-connecting-ip") ?? "local";
  const limited = await enforceRateLimit(request, "institution-search", clientAddress, 120, 60); if (limited) return limited;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("search_institution_directory_v2", {
      search_query: parsed.data.q,
      lifecycle_filter: parsed.data.lifecycle,
      presence_filter: parsed.data.presence,
      after_cursor: parsed.data.cursor ?? null,
      result_limit: parsed.data.limit
    });
    if (error) throw error;
    const rows = data ?? [];
    const items = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      aliases: typeof row.aliases === "string" ? row.aliases.split(/\|\||\|/).map((value) => value.trim()).filter(Boolean) : [],
      city: row.city,
      region: row.region,
      status: row.status,
      registrationStatus: row.registration_status,
      availability: row.availability,
      campus: row.campus_id ? {
        id: row.campus_id,
        slug: row.campus_slug,
        name: row.campus_name,
        shortName: row.campus_short_name,
        status: row.campus_status
      } : null
    }));
    return apiData(request, {
      items,
      nextCursor: rows.length === parsed.data.limit ? rows.at(-1)?.next_cursor ?? null : null
    });
  } catch {
    return apiError(request, 503, "service_unconfigured", "The college directory is temporarily unavailable.");
  }
}
