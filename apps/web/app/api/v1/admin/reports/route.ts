import { apiData, apiError, requireStaff } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireStaff(request); if (context instanceof NextResponse) return context;
  const status = new URL(request.url).searchParams.get("status") ?? "open";
  if (!new Set(["open", "reviewing"]).has(status)) return apiError(request, 400, "bad_request", "Unsupported report status.");
  const { data, error } = await context.supabase.rpc("moderation_report_queue");
  if (error) return apiError(request, 500, "internal_error", "Unable to load reports.");
  return apiData(request, (data ?? []).filter((report: { status: string }) => report.status === status));
}
