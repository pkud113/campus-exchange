import { NextResponse } from "next/server";
import { apiData, apiError, requireStaffCapability } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "institutions.read");
  if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const { data, error } = await context.supabase.rpc("admin_institution_directory", {
    search_term: url.searchParams.get("q") ?? "",
    lifecycle_filter: url.searchParams.get("lifecycle") ?? "all",
    after_institution: url.searchParams.get("cursor"),
    result_limit: Math.min(Number(url.searchParams.get("limit") ?? 25), 50)
  });
  return error ? apiError(request, 403, "forbidden", "Unable to load the institution directory.") : apiData(request, data ?? []);
}
