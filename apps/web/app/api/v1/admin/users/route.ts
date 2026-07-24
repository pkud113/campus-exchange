import { NextResponse } from "next/server";
import { apiData, apiError, requireStaffCapability } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "users.read");
  if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").replace(/[%_,()]/g, "").trim();
  let query = context.supabase
    .from("profiles")
    .select("id,handle,display_name,status,account_kind,verified_until,restricted_until,campus_id,campuses!inner(name,short_name,institution_id)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (context.staff.scope === "campus") query = query.eq("campus_id", context.staff.campusId);
  if (q) query = query.or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`);
  const { data, error } = await query;
  return error ? apiError(request, 403, "forbidden", "Unable to load users in this staff scope.") : apiData(request, data ?? []);
}
