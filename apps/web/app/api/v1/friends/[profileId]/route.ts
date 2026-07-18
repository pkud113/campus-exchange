import { z } from "zod";
import { apiData, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

const schema = z.object({ action: z.enum(["accept", "decline", "cancel", "remove"]), idempotencyKey: z.string().uuid() }).strict();
type Params = { params: Promise<{ profileId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "friend-action", context.userId, 60, 3600); if (limited) return limited;
  const input = await parseJson(request, schema); if (input instanceof NextResponse) return input;
  const { profileId } = await params;
  const { data, error } = await context.supabase.rpc("manage_friend_relationship", { target_profile: profileId, chosen_action: input.action, request_key: input.idempotencyKey });
  if (error) return mutationError(request, error, "Unable to update this friendship.");
  const result = data?.[0];
  return apiData(request, { relationshipId: result?.id, status: result?.status });
}
