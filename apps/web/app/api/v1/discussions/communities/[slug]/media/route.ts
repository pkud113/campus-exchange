import { z } from "zod";
import { NextResponse } from "next/server";
import { apiData, discussionMutationError, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ slug: string }> };
const schema = z.object({ mediaId: z.string().uuid(), purpose: z.enum(["community_icon", "community_banner"]) });
export async function POST(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, schema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { error } = await context.supabase.rpc("attach_discussion_media", { target_slug: slug, target_media: input.mediaId, target_purpose: input.purpose });
  return error ? discussionMutationError(request, error, "Unable to attach community media.") : apiData(request, { attached: true, mediaId: input.mediaId });
}
