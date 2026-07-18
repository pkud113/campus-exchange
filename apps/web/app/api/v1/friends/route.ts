import { friendRequestInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const requestedStatus = new URL(request.url).searchParams.get("status");
  let query = context.supabase.from("friend_relationships").select("id,profile_low_id,profile_high_id,requested_by,status,responded_at,created_at,updated_at").order("updated_at", { ascending: false });
  if (requestedStatus) query = query.eq("status", requestedStatus);
  const { data, error } = await query;
  if (error) return apiError(request, 500, "internal_error", "Unable to load friendships.");
  const rows = data ?? [];
  const profileIds = rows.map((row) => row.profile_low_id === context.userId ? row.profile_high_id : row.profile_low_id);
  const { data: profiles } = profileIds.length ? await context.supabase.rpc("safe_profile_cards", { target_ids: profileIds }) : { data: [] };
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  return apiData(request, rows.map((row) => {
    const otherId = row.profile_low_id === context.userId ? row.profile_high_id : row.profile_low_id;
    return { ...row, direction: row.requested_by === context.userId ? "outgoing" : "incoming", profile: profileMap.get(otherId) ?? null };
  }));
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
