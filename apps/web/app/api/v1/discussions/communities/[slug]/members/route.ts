import { NextResponse } from "next/server";
import { apiData, apiError, requireDiscussions } from "@/lib/api";
type Params = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Params) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const { slug } = await params;
  const { data: community } = await context.supabase.from("discussion_communities").select("id").eq("slug", slug.toLowerCase()).single();
  if (!community) return apiError(request, 404, "not_found", "Community not found.");
  const { data, error } = await context.supabase.from("discussion_memberships").select("role,state,joined_at,banned_reason,profiles!discussion_memberships_profile_id_fkey(id,handle,display_name,avatar_media_id)").eq("community_id", community.id).order("role").order("joined_at").limit(200);
  return error ? apiError(request, 500, "internal_error", "Unable to load members.") : apiData(request, data ?? []);
}
