import { contentDeletionSchema, discussionPostUpdateSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, discussionMutationError, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ postId: string }> };
export async function GET(request: Request, { params }: Params) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const { postId } = await params;
  const { data, error } = await context.supabase.from("discussion_posts").select("*,discussion_communities!inner(slug,display_name,icon_media_id,banner_media_id,rules,status),profiles!discussion_posts_author_id_fkey(handle,display_name,avatar_media_id)").eq("id", postId).single();
  if (error || !data) return apiError(request, 404, "not_found", "Post not found.");
  const [{ data: vote }, { data: saved }] = await Promise.all([
    context.supabase.from("discussion_post_votes").select("value").eq("post_id", postId).eq("profile_id", context.userId).maybeSingle(),
    context.supabase.from("discussion_saved_posts").select("post_id").eq("post_id", postId).eq("profile_id", context.userId).maybeSingle()
  ]);
  return apiData(request, { ...data, viewer_vote: vote?.value ?? 0, viewer_saved: Boolean(saved) });
}
export async function PATCH(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, discussionPostUpdateSchema); if (input instanceof NextResponse) return input;
  const { postId } = await params;
  const { data, error } = await context.supabase.rpc("update_discussion_post", { target_post: postId, submitted_title: input.title, submitted_body: input.body, submitted_link: input.linkUrl, submitted_media: input.mediaId });
  return error ? discussionMutationError(request, error, "Unable to update this post.") : apiData(request, data);
}
export async function DELETE(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, contentDeletionSchema); if (input instanceof NextResponse) return input;
  const { postId } = await params;
  const { error } = await context.supabase.rpc("delete_discussion_post", { target_post: postId, submitted_reason: input.reason });
  return error ? discussionMutationError(request, error, "Unable to delete this post.") : apiData(request, { deleted: true, purgeAfterDays: 30 });
}
