import { discussionVoteSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, discussionMutationError, enforceRateLimit, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ postId: string }> };
export async function POST(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-vote", context.userId, 120, 60); if (limited) return limited;
  const input = await parseJson(request, discussionVoteSchema); if (input instanceof NextResponse) return input;
  const { postId } = await params; const { data, error } = await context.supabase.rpc("set_discussion_vote", { target_type: "post", target_id: postId, desired_value: input.value });
  return error ? discussionMutationError(request, error, "Unable to update this vote.") : apiData(request, { score: data, value: input.value ?? 0 });
}
