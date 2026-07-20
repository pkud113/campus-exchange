import { moderationAppealDecisionSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireStaff, verifyMutationOrigin } from "@/lib/api";

type Params = { params: Promise<{ id: string; appealId: string }> };

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireStaff(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, moderationAppealDecisionSchema); if (input instanceof NextResponse) return input;
  const { appealId } = await params;
  const { data, error } = await context.supabase.rpc("resolve_moderation_appeal", {
    target_appeal: appealId, chosen_action: input.action, target_reviewer: input.reviewerId,
    internal_reason: input.internalReason, user_resolution: input.userResolution, reverse_action: input.reverseAction,
  });
  return error ? mutationError(request, error, "Unable to update this appeal.") : apiData(request, { id: data, action: input.action });
}
