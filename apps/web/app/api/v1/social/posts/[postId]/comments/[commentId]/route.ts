import { socialCommentUpdateSchema } from "@campus-exchange/contracts";
import { apiData, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ postId: string; commentId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "social-comment-update", context.userId, 90, 3600); if (limited) return limited;
  const input = await parseJson(request, socialCommentUpdateSchema); if (input instanceof NextResponse) return input;
  const { commentId } = await params;
  const { data, error } = await context.supabase.rpc("update_social_comment", { target_comment: commentId, submitted_body: input.body });
  return error ? mutationError(request, error, "Unable to update this comment.") : apiData(request, { id: data });
}

export async function DELETE(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "social-comment-delete", context.userId, 60, 3600); if (limited) return limited;
  const { commentId } = await params;
  const { data, error } = await context.supabase.rpc("delete_social_comment", { target_comment: commentId });
  return error ? mutationError(request, error, "Unable to delete this comment.") : apiData(request, { id: data, status: "deleted" });
}
