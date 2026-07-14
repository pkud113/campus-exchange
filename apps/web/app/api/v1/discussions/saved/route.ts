import { NextResponse } from "next/server";
import { apiData, apiError, requireDiscussions } from "@/lib/api";
export async function GET(request: Request) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.from("discussion_saved_posts").select("created_at,discussion_posts(*,discussion_communities!inner(slug,display_name),profiles!discussion_posts_author_id_fkey(handle,display_name))").eq("profile_id", context.userId).order("created_at", { ascending: false }).limit(50);
  return error ? apiError(request, 500, "internal_error", "Unable to load saved posts.") : apiData(request, data ?? []);
}
