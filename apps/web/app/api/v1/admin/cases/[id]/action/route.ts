import { moderationCaseActionSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireStaff, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireStaff(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, moderationCaseActionSchema); if (input instanceof NextResponse) return input;
  const { id } = await params;
  const { data, error } = await context.supabase.rpc("moderate_case", { target_case: id, chosen_action: input.action, action_reason: input.reason, user_message: input.userMessage, restriction_until: input.restrictionUntil });
  return error ? mutationError(request, error, "Unable to complete this moderation action.") : apiData(request, { actionId: data, completed: true });
}
