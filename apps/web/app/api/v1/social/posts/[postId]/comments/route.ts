import { socialCommentInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";
type Params = { params: Promise<{ postId: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { postId } = await params;
  const { data, error } = await context.supabase.from("social_comments").select("id,post_id,author_profile_id,parent_comment_id,body,edited_at,removed_at,deleted_at,created_at").eq("post_id", postId).order("created_at").limit(200);
  if (error) return apiError(request, 404, "not_found", "Post comments are unavailable.");
  const profileIds = (data ?? []).flatMap((comment) => comment.author_profile_id ? [comment.author_profile_id] : []);
  const { data: profiles } = profileIds.length ? await context.supabase.rpc("safe_profile_cards", { target_ids: profileIds }) : { data: [] };
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  return apiData(request, (data ?? []).map((comment) => ({ ...comment, author: comment.author_profile_id ? profileMap.get(comment.author_profile_id) ?? null : null, canManage: comment.author_profile_id === context.userId })));
}

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "social-comment", context.userId, 60, 3600); if (limited) return limited;
  const input = await parseJson(request, socialCommentInputSchema); if (input instanceof NextResponse) return input;
  const { postId } = await params;
  const moderation=await authorizeSharedTextMutation(request,context,{surface:"social_comment",operation:"create",fields:{body:input.body},idempotencyKey:input.idempotencyKey});if(moderation instanceof Response)return moderation;
  const { data, error } = await context.supabase.rpc("create_social_comment", { target_post: postId, parent_comment: input.parentCommentId, submitted_body: input.body, request_key: input.idempotencyKey });
  return error ? mutationError(request, error, "Unable to add this comment.") : apiData(request, { id: data }, 201);
}
