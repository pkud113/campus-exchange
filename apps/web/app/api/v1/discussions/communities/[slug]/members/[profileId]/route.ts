import { z } from "zod";
import { uuidSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, discussionMutationError, enforceRateLimit, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ slug: string; profileId: string }> };
const schema = z.object({ action: z.enum(["ban_member", "unban_member", "add_moderator", "remove_moderator"]), reason: z.string().trim().max(1000).default(""), idempotencyKey: uuidSchema });
export async function PATCH(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-moderation", context.userId, 60, 3600); if (limited) return limited;
  const input = await parseJson(request, schema); if (input instanceof NextResponse) return input;
  const { slug, profileId } = await params;
  const { data, error } = await context.supabase.rpc("moderate_discussion", { target_slug: slug, chosen_action: input.action, target_type: "member", target_id: profileId, submitted_reason: input.reason, submitted_request_id: context.requestId, submitted_key: input.idempotencyKey });
  return error ? discussionMutationError(request, error, "Unable to moderate this member.") : apiData(request, data);
}
