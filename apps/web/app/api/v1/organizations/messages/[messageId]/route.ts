import { organizationMessageMutationSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

type Params = { params: Promise<{ messageId: string }> };
export async function PATCH(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, organizationMessageMutationSchema); if (input instanceof NextResponse) return input;
  const { messageId } = await params;
  const { error } = await context.supabase.rpc("manage_organization_channel_message", { target_message: messageId, chosen_action: input.action, submitted_body: input.body, action_reason: input.reason });
  return error ? mutationError(request, error, "Unable to update this message.") : apiData(request, { updated: true });
}
