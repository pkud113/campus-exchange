import { NextResponse } from "next/server";
import { apiData, apiError, requireStaffCapability } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "cases.read");
  if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.rpc("admin_dashboard_summary");
  return error ? apiError(request, 403, "forbidden", "Unable to load the scoped operations summary.") : apiData(request, data);
}
