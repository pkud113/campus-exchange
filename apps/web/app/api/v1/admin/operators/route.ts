import { NextResponse } from "next/server";
import { apiData, apiError, requireStaffCapability } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "cases.read");
  if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const { data, error } = await context.supabase.rpc("staff_operator_directory", {
    search_term: url.searchParams.get("q") ?? "",
    target_campus: url.searchParams.get("campus"),
    result_limit: Math.min(Number(url.searchParams.get("limit") ?? 20), 50)
  });
  return error ? apiError(request, 403, "forbidden", "Unable to load the scoped operator directory.") : apiData(request, data ?? []);
}
