import { profileSearchSchema } from "@campus-exchange/contracts";
import { apiData, apiError, requireVerified } from "@/lib/api";
import { NextResponse } from "next/server";
export { PATCH } from "../profile/route";

export async function GET(request: Request) {
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const parsed = profileSearchSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Enter at least two characters to search.");
  const term = parsed.data.q.replace(/[^a-z0-9 _-]/gi, "").trim();
  if (term.length < 2) return apiError(request, 400, "bad_request", "Enter at least two searchable characters.");
  const { data, error } = await context.supabase.rpc("search_member_directory", {
    search_term: term,
    campus_filter: parsed.data.campus ?? null,
    result_limit: parsed.data.limit,
  });
  return error
    ? apiError(request, 500, "internal_error", "Unable to search Campus Exchange members.")
    : apiData(request, data ?? []);
}
