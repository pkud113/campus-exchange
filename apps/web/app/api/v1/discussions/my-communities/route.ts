import { NextResponse } from "next/server";
import { apiData, apiError, requireDiscussions } from "@/lib/api";
export async function GET(request: Request) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.from("discussion_memberships").select("role,state,joined_at,discussion_communities(*)").eq("profile_id", context.userId).order("updated_at", { ascending: false });
  return error ? apiError(request, 500, "internal_error", "Unable to load your communities.") : apiData(request, data ?? []);
}
