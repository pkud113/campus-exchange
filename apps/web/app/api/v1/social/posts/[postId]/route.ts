import { socialPostUpdateSchema } from "@campus-exchange/contracts";
import { apiData, apiError, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { hydrateSocialPosts, type SocialPostRow } from "@/lib/social";
import { NextResponse } from "next/server";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";

type Params = { params: Promise<{ postId: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { postId } = await params;
  const { data, error } = await context.supabase.from("social_posts").select("*").eq("id", postId).maybeSingle();
  if (error || !data) return apiError(request, 404, "not_found", "This post is unavailable.");
  const [post] = await hydrateSocialPosts(context.supabase, context.userId, [data as SocialPostRow]);
  return apiData(request, post);
}

export async function PATCH(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "social-post-update", context.userId, 60, 3600); if (limited) return limited;
  const input = await parseJson(request, socialPostUpdateSchema); if (input instanceof NextResponse) return input;
  const { postId } = await params;
  const moderation=await authorizeSharedTextMutation(request,context,{surface:"social_post",operation:"edit",fields:{body:input.body},targetId:postId});if(moderation instanceof Response)return moderation;
  const { error } = await context.supabase.rpc("update_social_post", {
    target_post: postId,
    submitted_body: input.body,
    submitted_media: input.mediaIds,
    submitted_visibility: input.visibility,
  });
  if (error) return mutationError(request, error, "Unable to update this post.");
  const { data } = await context.supabase.from("social_posts").select("*").eq("id", postId).single();
  const [post] = data ? await hydrateSocialPosts(context.supabase, context.userId, [data as SocialPostRow]) : [];
  return apiData(request, post ?? { id: postId });
}

export async function DELETE(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "social-post-delete", context.userId, 30, 3600); if (limited) return limited;
  const { postId } = await params;
  const { data, error } = await context.supabase.rpc("delete_social_post", { target_post: postId });
  return error ? mutationError(request, error, "Unable to delete this post.") : apiData(request, { id: data, status: "deleted" });
}
