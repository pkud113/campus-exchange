import { NextResponse } from "next/server";
import { apiData, discussionMutationError, enforceRateLimit, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ slug: string }> };
async function setMembership(request: Request, params: Params["params"], desired: boolean) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-membership", context.userId, 30, 3600); if (limited) return limited;
  const { slug } = await params;
  const { data, error } = await context.supabase.rpc("set_discussion_membership", { target_slug: slug, desired });
  return error ? discussionMutationError(request, error, "Unable to update community membership.") : apiData(request, data);
}
export async function POST(request: Request, { params }: Params) { return setMembership(request, params, true); }
export async function DELETE(request: Request, { params }: Params) { return setMembership(request, params, false); }
