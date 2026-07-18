import { socialReactionInputSchema } from "@campus-exchange/contracts";
import { apiData, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
type Params = { params: Promise<{ postId: string }> };

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "social-reaction", context.userId, 120, 3600); if (limited) return limited;
  const input = await parseJson(request, socialReactionInputSchema); if (input instanceof NextResponse) return input;
  const { postId } = await params;
  const { data, error } = await context.supabase.rpc("set_social_reaction", { target_post: postId, chosen_reaction: input.reaction });
  return error ? mutationError(request, error, "Unable to update this reaction.") : apiData(request, { count: data, reaction: input.reaction });
}
