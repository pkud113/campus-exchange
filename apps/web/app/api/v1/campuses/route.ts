import { NextResponse } from "next/server";
import { apiData, apiError, requireVerified } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase
    .from("campuses")
    .select("id,name,short_name,slug,city,region,country_code,timezone")
    .eq("status", "enabled")
    .order("name");
  return error
    ? apiError(request, 500, "internal_error", "Unable to load campuses.")
    : apiData(request, data ?? []);
}
