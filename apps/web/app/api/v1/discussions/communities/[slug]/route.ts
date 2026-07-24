import { contentDeletionSchema, discussionCommunityUpdateSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, discussionMutationError, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";
type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const { slug } = await params;
  const { data: community, error } = await context.supabase.from("discussion_communities").select("*").eq("slug", slug.toLowerCase()).single();
  if (error || !community) return apiError(request, 404, "not_found", "Community not found.");
  const [{ data: membership }, { data: moderators }] = await Promise.all([
    context.supabase.from("discussion_memberships").select("role,state").eq("community_id", community.id).eq("profile_id", context.userId).maybeSingle(),
    context.supabase.from("discussion_memberships").select("role,profiles!discussion_memberships_profile_id_fkey(id,handle,display_name,avatar_media_id)").eq("community_id", community.id).eq("state", "active").in("role", ["owner", "moderator"])
  ]);
  return apiData(request, { ...community, membership, moderators: moderators ?? [] });
}

export async function PATCH(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, discussionCommunityUpdateSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const {data:targetCommunity}=await context.supabase.from("discussion_communities").select("id,display_name,description,rules").eq("slug",slug.toLowerCase()).single();
  const fields={...(targetCommunity?.display_name===input.displayName?{}:{displayName:input.displayName}),...(targetCommunity?.description===input.description?{}:{description:input.description}),...(targetCommunity?.rules===input.rules?{}:{rules:input.rules})};if(Object.keys(fields).length){const moderation=await authorizeSharedTextMutation(request,context,{surface:"discussion_community",operation:"edit",fields,targetId:targetCommunity?.id});if(moderation instanceof Response)return moderation;}
  const { data, error } = await context.supabase.rpc("update_discussion_community", { target_slug: slug, submitted_name: input.displayName, submitted_description: input.description, submitted_rules: input.rules, submitted_permission: input.postingPermission, submitted_comments_enabled: input.commentsEnabled });
  return error ? discussionMutationError(request, error, "Unable to update this community.") : apiData(request, data);
}

export async function DELETE(request: Request, { params }: Params) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, contentDeletionSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { error } = await context.supabase.rpc("delete_discussion_community", { target_slug: slug, submitted_reason: input.reason, submitted_request_id: context.requestId });
  return error ? discussionMutationError(request, error, "Unable to delete this community.") : apiData(request, { deleted: true, purgeAfterDays: 30 });
}
