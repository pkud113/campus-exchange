import { socialCommentMutationSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

type Params = { params: Promise<{ commentId: string }> };
export async function PATCH(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, socialCommentMutationSchema); if (input instanceof NextResponse) return input;
  const { commentId } = await params;
  const { error } = await context.supabase.rpc("manage_social_comment", { target_comment: commentId, chosen_action: input.action, submitted_body: input.body });
  return error ? mutationError(request, error, "Unable to update this comment.") : apiData(request, { updated: true });
}
