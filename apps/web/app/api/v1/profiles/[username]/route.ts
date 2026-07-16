import { apiData, apiError, requireVerified } from "@/lib/api";
import { NextResponse } from "next/server";
type Params = { params: Promise<{ username: string }> };
export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const { username } = await params;
  const { data, error } = await context.supabase.rpc("safe_profile_by_username", { target_username: username.toLowerCase() });
  const profile = data?.[0];
  return error || !profile ? apiError(request, 404, "not_found", "Profile not found.") : apiData(request, profile);
}
