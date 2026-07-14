import { discussionModerationSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, discussionMutationError, enforceRateLimit, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
type Params = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Params) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const { slug } = await params;
  const { data: community } = await context.supabase.from("discussion_communities").select("id").eq("slug", slug.toLowerCase()).single();
  if (!community) return apiError(request, 404, "not_found", "Community not found.");
  const [actions, reports, members, removedPosts, removedComments] = await Promise.all([
    context.supabase.from("discussion_moderation_actions").select("*").eq("community_id", community.id).order("created_at", { ascending: false }).limit(100),
    context.supabase.rpc("discussion_report_queue", { target_slug: slug }),
    context.supabase.from("discussion_memberships").select("role,state,banned_reason,profiles!discussion_memberships_profile_id_fkey(id,handle,display_name)").eq("community_id", community.id).or("state.eq.banned,role.eq.moderator,role.eq.owner"),
    context.supabase.from("discussion_posts").select("id,title,removed_at,removal_reason,author_id").eq("community_id", community.id).not("removed_at", "is", null).limit(100),
    context.supabase.from("discussion_comments").select("id,post_id,removed_at,removal_reason,author_id").eq("community_id", community.id).not("removed_at", "is", null).limit(100)
  ]);
  const error = actions.error ?? reports.error ?? members.error ?? removedPosts.error ?? removedComments.error;
  if (error) return apiError(request, 403, "forbidden", "Moderator access is required.");
  return apiData(request, { actions: actions.data ?? [], reports: reports.data ?? [], members: members.data ?? [], removedPosts: removedPosts.data ?? [], removedComments: removedComments.data ?? [] });
}
export async function POST(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-moderation", context.userId, 60, 3600); if (limited) return limited;
  const input = await parseJson(request, discussionModerationSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { data, error } = await context.supabase.rpc("moderate_discussion", { target_slug: slug, chosen_action: input.action, target_type: input.targetType, target_id: input.targetId, submitted_reason: input.reason, submitted_request_id: context.requestId, submitted_key: input.idempotencyKey });
  return error ? discussionMutationError(request, error, "Unable to complete this moderation action.") : apiData(request, data);
}
