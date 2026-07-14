import { contentDeletionSchema, discussionCommentUpdateSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, discussionMutationError, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ commentId: string }> };
export async function PATCH(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, discussionCommentUpdateSchema); if (input instanceof NextResponse) return input;
  const { commentId } = await params; const { data, error } = await context.supabase.rpc("update_discussion_comment", { target_comment: commentId, submitted_body: input.body });
  return error ? discussionMutationError(request, error, "Unable to update this comment.") : apiData(request, data);
}
export async function DELETE(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, contentDeletionSchema); if (input instanceof NextResponse) return input;
  const { commentId } = await params; const { error } = await context.supabase.rpc("delete_discussion_comment", { target_comment: commentId, submitted_reason: input.reason });
  return error ? discussionMutationError(request, error, "Unable to delete this comment.") : apiData(request, { deleted: true, purgeAfterDays: 30 });
}
