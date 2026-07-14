import { discussionOwnershipSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, discussionMutationError, enforceRateLimit, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ slug: string }> };
export async function POST(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-moderation", context.userId, 60, 3600); if (limited) return limited;
  const input = await parseJson(request, discussionOwnershipSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { data, error } = await context.supabase.rpc("transfer_discussion_ownership", { target_slug: slug, new_owner: input.newOwnerId, submitted_reason: input.reason, submitted_request_id: context.requestId, submitted_key: input.idempotencyKey });
  return error ? discussionMutationError(request, error, "Unable to transfer ownership.") : apiData(request, data);
}
