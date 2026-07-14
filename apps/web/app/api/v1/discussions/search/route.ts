import { NextResponse } from "next/server";
import { apiData, apiError, requireDiscussions } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireDiscussions(request);
  if (context instanceof NextResponse) return context;
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2 || q.length > 120) return apiError(request, 400, "bad_request", "Enter at least two characters to search.");
  const safe = q.replace(/[%_,.*]/g, "");
  const [communities, posts] = await Promise.all([
    context.supabase.from("discussion_communities").select("*").or(`display_name.ilike.*${safe}*,slug.ilike.*${safe}*,description.ilike.*${safe}*`).eq("status", "active").is("deleted_at", null).limit(20),
    context.supabase.from("discussion_posts").select("*,discussion_communities!inner(slug,display_name),profiles!discussion_posts_author_id_fkey(handle,display_name)").textSearch("search_vector", q, { type: "websearch", config: "english" }).is("deleted_at", null).is("removed_at", null).limit(30)
  ]);
  if (communities.error || posts.error) return apiError(request, 500, "internal_error", "Unable to search discussions.");
  return apiData(request, { communities: communities.data ?? [], posts: posts.data ?? [] });
}
