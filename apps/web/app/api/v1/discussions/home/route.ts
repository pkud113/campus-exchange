import { NextResponse } from "next/server";
import { apiData, apiError, requireDiscussions } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const { data: memberships } = await context.supabase.from("discussion_memberships").select("community_id").eq("profile_id", context.userId).eq("state", "active");
  const joinedIds = (memberships ?? []).map((row) => row.community_id);
  const [popular, newest, trending, joined] = await Promise.all([
    context.supabase.from("discussion_communities").select("*").eq("status", "active").eq("visibility", "campus_private").is("deleted_at", null).order("member_count", { ascending: false }).order("id", { ascending: false }).limit(6),
    context.supabase.from("discussion_communities").select("*").eq("status", "active").eq("visibility", "campus_private").is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6),
    context.supabase.from("discussion_posts").select("*,discussion_communities!inner(slug,display_name,icon_media_id),profiles!discussion_posts_author_id_fkey(handle,display_name)").is("deleted_at", null).is("removed_at", null).order("hot_rank", { ascending: false }).order("id", { ascending: false }).limit(12),
    joinedIds.length ? context.supabase.from("discussion_posts").select("*,discussion_communities!inner(slug,display_name,icon_media_id),profiles!discussion_posts_author_id_fkey(handle,display_name)").in("community_id", joinedIds).is("deleted_at", null).is("removed_at", null).order("hot_rank", { ascending: false }).order("id", { ascending: false }).limit(20) : Promise.resolve({ data: [], error: null })
  ]);
  const error = popular.error ?? newest.error ?? trending.error ?? joined.error;
  if (error) return apiError(request, 500, "internal_error", "Unable to load discussions.");
  return apiData(request, { joinedFeed: joined.data ?? [], popularCommunities: popular.data ?? [], newestCommunities: newest.data ?? [], trendingPosts: trending.data ?? [] });
}
