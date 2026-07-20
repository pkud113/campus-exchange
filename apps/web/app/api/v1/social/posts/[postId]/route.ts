import { socialPostMutationSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

type Params = { params: Promise<{ postId: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { postId } = await params;
  const { data: post, error } = await context.supabase.from("social_posts").select("id,author_profile_id,organization_id,body,visibility,status,reaction_count,comment_count,edited_at,created_at,social_post_media(media_id,position)").eq("id", postId).eq("status", "active").single();
  if (error || !post) return apiError(request, 404, "not_found", "Post not found.");
  const [{ data: authors }, { data: reactions }] = await Promise.all([
    context.supabase.rpc("safe_profile_cards", { target_ids: [post.author_profile_id] }),
    context.supabase.from("social_reactions").select("reaction").eq("post_id", post.id).eq("profile_id", context.userId).maybeSingle(),
  ]);
  return apiData(request, { ...post, author: authors?.[0] ?? null, viewerReaction: reactions?.reaction ?? null, viewerOwns: post.author_profile_id === context.userId, viewerId: context.userId });
}

export async function PATCH(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, socialPostMutationSchema); if (input instanceof NextResponse) return input;
  const { postId } = await params;
  const { error } = await context.supabase.rpc("manage_social_post", { target_post: postId, chosen_action: input.action, submitted_body: input.body });
  return error ? mutationError(request, error, "Unable to update this post.") : apiData(request, { updated: true });
}
