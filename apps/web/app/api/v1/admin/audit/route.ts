import { NextResponse } from "next/server";
import { apiData, apiError, requireStaffCapability } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "audit.read");
  if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const { data, error } = await context.supabase.rpc("admin_audit_history", {
    target_campus: url.searchParams.get("campus"),
    action_filter: url.searchParams.get("action"),
    after_id: url.searchParams.get("cursor"),
    result_limit: Math.min(Number(url.searchParams.get("limit") ?? 50), 100)
  });
  return error ? apiError(request, 403, "forbidden", "Unable to load audit history.") : apiData(request, data ?? []);
}
