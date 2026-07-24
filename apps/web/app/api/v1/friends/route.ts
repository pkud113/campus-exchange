import { friendBoxQuerySchema, friendRequestInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const parsed = friendBoxQuerySchema.safeParse({
    box: url.searchParams.get("box") ?? "all",
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? 20
  });
  if (!parsed.success) return apiError(request, 400, "bad_request", "Choose a valid friend view.");
  const { data, error } = await context.supabase.rpc("friend_box_v2", {
    requested_box: parsed.data.box,
    after_cursor: parsed.data.cursor ?? null,
    result_limit: parsed.data.limit
  });
  if (error) return apiError(request, 500, "internal_error", "Unable to load friendships.");
  return apiData(request, data ?? { items: [], counts: { all: 0, incoming: 0, sent: 0 }, nextCursor: null });
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "friend-request", context.userId, 30, 3600); if (limited) return limited;
  const input = await parseJson(request, friendRequestInputSchema); if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("manage_friend_relationship", { target_profile: input.profileId, chosen_action: "send", request_key: input.idempotencyKey });
  if (error) return mutationError(request, error, "Unable to send this friend request.");
  const result = data?.[0];
  return apiData(request, { relationshipId: result?.id, status: result?.status }, 201);
}
