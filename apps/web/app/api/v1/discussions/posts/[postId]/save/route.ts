import { NextResponse } from "next/server";
import { apiData, discussionMutationError, enforceRateLimit, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ postId: string }> };
async function setSaved(request: Request, params: Params["params"], desired: boolean) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-save", context.userId, 120, 60); if (limited) return limited;
  const { postId } = await params; const { data, error } = await context.supabase.rpc("set_discussion_saved", { target_post: postId, desired });
  return error ? discussionMutationError(request, error, "Unable to update saved posts.") : apiData(request, { saved: data });
}
export async function POST(request: Request, { params }: Params) { return setSaved(request, params, true); }
export async function DELETE(request: Request, { params }: Params) { return setSaved(request, params, false); }
