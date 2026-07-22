import { discussionCommentInputSchema, type DiscussionComment } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, decodeCursor, discussionMutationError, encodeCursor, enforceRateLimit, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
import { buildCommentTree } from "@/lib/discussions";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";
type Params = { params: Promise<{ postId: string }> };
type CommentRow = { id: string; post_id: string; author_id: string | null; parent_comment_id: string | null; depth: number; body: string | null; score: number; reply_count: number; removed_at: string | null; deleted_at: string | null; created_at: string };

function mapComment(row: CommentRow, viewerVote: -1 | 0 | 1, author?: { handle: string; display_name: string | null }): DiscussionComment {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    parentCommentId: row.parent_comment_id,
    depth: row.depth,
    body: row.deleted_at ? null : row.body,
    score: row.score,
    replyCount: row.reply_count,
    removedAt: row.removed_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    viewerVote,
    ...(author ? { author } : {}),
  };
}

export async function GET(request: Request, { params }: Params) {
  const context = await requireDiscussions(request);
  if (context instanceof NextResponse) return context;
  const { postId } = await params;
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const cursor = decodeCursor(url.searchParams.get("cursor") ?? undefined);
  const [{ data, error }, { data: post }] = await Promise.all([
    context.supabase.rpc("discussion_comment_tree", { target_post: postId, cursor_created: cursor?.createdAt ?? null, cursor_id: cursor?.id ?? null, root_limit: limit + 1 }),
    context.supabase.from("discussion_posts").select("comment_count").eq("id", postId).maybeSingle(),
  ]);
  if (error) return apiError(request, error.code === "P0002" ? 404 : 500, error.code === "P0002" ? "not_found" : "internal_error", "Unable to load comments.");
  const rows = (data ?? []) as CommentRow[];
  const ids = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.flatMap((row) => row.author_id ? [row.author_id] : []))];
  const [{ data: votes }, { data: authors }] = await Promise.all([
    ids.length ? context.supabase.from("discussion_comment_votes").select("comment_id,value").eq("profile_id", context.userId).in("comment_id", ids) : Promise.resolve({ data: [] }),
    authorIds.length ? context.supabase.from("profiles").select("id,handle,display_name").in("id", authorIds) : Promise.resolve({ data: [] })
  ]);
  const voteMap = new Map((votes ?? []).map((row) => [row.comment_id, row.value]));
  const authorMap = new Map((authors ?? []).map((row) => [row.id, { handle: row.handle, display_name: row.display_name }]));
  const mapped = rows.map((row) => mapComment(row, (voteMap.get(row.id) ?? 0) as -1 | 0 | 1, row.author_id ? authorMap.get(row.author_id) : undefined));
  const tree = buildCommentTree(mapped);
  const page = tree.slice(0, limit);
  const last = page.at(-1);
  return apiData(request, { comments: page, total: mapped.length, postCommentCount: post?.comment_count ?? mapped.length, page: { nextCursor: tree.length > limit && last ? encodeCursor(last.createdAt, last.id) : null } });
}

export async function POST(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request);
  if (origin) return origin;
  const context = await requireDiscussions(request);
  if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-comment", context.userId, 60, 3600);
  if (limited) return limited;
  const input = await parseJson(request, discussionCommentInputSchema);
  if (input instanceof NextResponse) return input;
  const { postId } = await params;
  const moderation=await authorizeSharedTextMutation(request,context,{surface:"discussion_comment",operation:"create",fields:{body:input.body},idempotencyKey:input.idempotencyKey});if(moderation instanceof Response)return moderation;
  const { data, error } = await context.supabase.rpc("create_discussion_comment", { target_post: postId, target_parent: input.parentCommentId, submitted_body: input.body, submitted_key: input.idempotencyKey });
  if (error) return discussionMutationError(request, error, "Unable to add this comment.");
  const created = (Array.isArray(data) ? data[0] : data) as CommentRow | null;
  if (!created) return apiError(request, 500, "internal_error", "The comment was created but could not be returned.");
  const [{ data: author }, { data: parent }, { data: post }] = await Promise.all([
    created.author_id ? context.supabase.from("profiles").select("handle,display_name").eq("id", created.author_id).maybeSingle() : Promise.resolve({ data: null }),
    created.parent_comment_id ? context.supabase.from("discussion_comments").select("reply_count").eq("id", created.parent_comment_id).maybeSingle() : Promise.resolve({ data: null }),
    context.supabase.from("discussion_posts").select("comment_count").eq("id", created.post_id).single(),
  ]);
  return apiData(request, {
    comment: mapComment(created, 0, author ?? undefined),
    parentReplyCount: parent?.reply_count ?? null,
    postCommentCount: post?.comment_count ?? null,
  }, 201);
}
