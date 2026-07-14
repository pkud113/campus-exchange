import { discussionFeedQuerySchema, discussionPostInputSchema, type DiscussionSort } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, discussionMutationError, enforceRateLimit, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
import { decodeDiscussionCursor, discussionCursorFor } from "@/lib/discussions";
type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const { slug } = await params; const parsed = discussionFeedQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Invalid discussion feed parameters.");
  const { sort, limit } = parsed.data; const cursor = decodeDiscussionCursor(parsed.data.cursor);
  const { data: community } = await context.supabase.from("discussion_communities").select("id").eq("slug", slug.toLowerCase()).single();
  if (!community) return apiError(request, 404, "not_found", "Community not found.");
  let query = context.supabase.from("discussion_posts").select("*,profiles!discussion_posts_author_id_fkey(handle,display_name,avatar_media_id)").eq("community_id", community.id).is("deleted_at", null).is("removed_at", null).order("is_pinned", { ascending: false }).limit(limit + 1);
  if (sort === "new") query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
  else if (sort === "top") query = query.order("score", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
  else if (sort === "comments") query = query.order("comment_count", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
  else query = query.order("hot_rank", { ascending: false }).order("id", { ascending: false });
  if (cursor?.sort === sort) {
    if (sort === "new") query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    else if (sort === "top") query = query.or(`score.lt.${cursor.value},and(score.eq.${cursor.value},created_at.lt.${cursor.createdAt}),and(score.eq.${cursor.value},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    else if (sort === "comments") query = query.or(`comment_count.lt.${cursor.value},and(comment_count.eq.${cursor.value},created_at.lt.${cursor.createdAt}),and(comment_count.eq.${cursor.value},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    else query = query.or(`hot_rank.lt.${cursor.value},and(hot_rank.eq.${cursor.value},id.lt.${cursor.id})`);
  }
  const { data, error } = await query; if (error) return apiError(request, 500, "internal_error", "Unable to load community posts.");
  const visible = (data ?? []).slice(0, limit); const ids = visible.map((row) => row.id);
  const [votes, saves] = ids.length ? await Promise.all([
    context.supabase.from("discussion_post_votes").select("post_id,value").eq("profile_id", context.userId).in("post_id", ids),
    context.supabase.from("discussion_saved_posts").select("post_id").eq("profile_id", context.userId).in("post_id", ids)
  ]) : [{ data: [] }, { data: [] }];
  const voteMap = new Map((votes.data ?? []).map((row) => [row.post_id, row.value])); const saved = new Set((saves.data ?? []).map((row) => row.post_id));
  const rows = visible.map((row) => ({ ...row, viewer_vote: voteMap.get(row.id) ?? 0, viewer_saved: saved.has(row.id) })); const last = visible.at(-1);
  return NextResponse.json({ data: rows, page: { nextCursor: (data ?? []).length > limit && last ? discussionCursorFor(last, sort as DiscussionSort) : null } }, { headers: { "cache-control": "private, no-store", "x-request-id": context.requestId } });
}

export async function POST(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-post", context.userId, 20, 3600); if (limited) return limited;
  const input = await parseJson(request, discussionPostInputSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { data, error } = await context.supabase.rpc("create_discussion_post", { target_slug: slug, submitted_type: input.postType, submitted_title: input.title, submitted_body: input.body, submitted_link: input.linkUrl, submitted_media: input.mediaId, submitted_key: input.idempotencyKey });
  return error ? discussionMutationError(request, error, "Unable to create this post.") : apiData(request, data, 201);
}
