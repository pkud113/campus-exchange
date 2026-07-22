import { organizationChannelInputSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";

type Params = { params: Promise<{ slug: string }> };
type ChannelCapability = { channel_id: string; can_view: boolean; can_send: boolean; can_manage_messages: boolean; can_create_announcements: boolean };

async function organizationId(context: Awaited<ReturnType<typeof requireVerified>>, slug: string) {
  if (context instanceof NextResponse) return null;
  const { data } = await context.supabase.from("organizations").select("id").eq("slug", slug.toLowerCase()).single();
  return data?.id ?? null;
}

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { slug } = await params; const id = await organizationId(context, slug);
  if (!id) return apiError(request, 404, "not_found", "Organization workspace not found.");
  const [{ data: categories, error: categoryError }, { data: channels, error: channelError }, { data: reads }, { data: roles }, { data: capabilities }, { data: roleOverrides }, { data: memberOverrides }, { data: roleAssignments }, { data: viewerCapabilities }] = await Promise.all([
    context.supabase.from("organization_categories").select("id,name,sort_position").eq("organization_id", id).order("sort_position").order("id"),
    context.supabase.from("organization_channels").select("id,category_id,name,description,channel_type,visibility,sort_position,slow_mode_seconds,status,created_at").eq("organization_id", id).order("sort_position").order("id"),
    context.supabase.from("organization_channel_reads").select("channel_id,last_read_at"),
    context.supabase.from("organization_roles").select("id,builtin_key,name,color,sort_position,authority_rank,permissions,is_assignable").eq("organization_id", id).order("sort_position"),
    context.supabase.rpc("organization_channel_capabilities", { target_organization: id }),
    context.supabase.from("organization_channel_role_overrides").select("channel_id,role_id,view_channel,send_messages,manage_messages,create_announcements"),
    context.supabase.from("organization_channel_member_overrides").select("channel_id,profile_id,view_channel,send_messages,manage_messages,create_announcements"),
    context.supabase.from("organization_role_assignments").select("role_id,profile_id").eq("organization_id", id),
    context.supabase.rpc("organization_viewer_capabilities", { target_organization: id }),
  ]);
  if (categoryError || channelError) return apiError(request, 500, "internal_error", "Unable to load this workspace.");
  const readMap = new Map((reads ?? []).map((row) => [row.channel_id, row.last_read_at]));
  const visibleChannels = channels ?? [];
  const unread = visibleChannels.length ? await Promise.all(visibleChannels.map(async (channel) => {
    const after = readMap.get(channel.id);
    let query = context.supabase.from("organization_channel_messages").select("id", { count: "exact", head: true }).eq("channel_id", channel.id).neq("author_profile_id", context.userId);
    if (after) query = query.gt("created_at", after);
    const { count } = await query;
    return [channel.id, count ?? 0] as const;
  })) : [];
  const unreadMap = new Map(unread);
  const capabilityMap = new Map<string, ChannelCapability>((capabilities ?? []).map((row: unknown) => {
    const capability = row as ChannelCapability;
    return [capability.channel_id, capability] as const;
  }));
  const viewer = viewerCapabilities?.[0] ?? { can_manage_roles: false, can_assign_roles: false, can_manage_channels: false, can_view_audit: false };
  return apiData(request, {
    categories: categories ?? [],
    channels: visibleChannels.map((channel) => ({ ...channel, unreadCount: unreadMap.get(channel.id) ?? 0, canView: Boolean(capabilityMap.get(channel.id)?.can_view), canSend: Boolean(capabilityMap.get(channel.id)?.can_send), canManageMessages: Boolean(capabilityMap.get(channel.id)?.can_manage_messages), canCreateAnnouncements: Boolean(capabilityMap.get(channel.id)?.can_create_announcements) })),
    roles: roles ?? [], viewerCapabilities: viewer,
    roleOverrides: viewer.can_manage_channels ? roleOverrides ?? [] : [],
    memberOverrides: viewer.can_manage_channels ? memberOverrides ?? [] : (memberOverrides ?? []).filter((row) => row.profile_id === context.userId),
    roleAssignments: viewer.can_manage_roles || viewer.can_assign_roles || viewer.can_manage_channels ? roleAssignments ?? [] : [],
  });
}

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "organization-channel-create", context.userId, 30, 3600); if (limited) return limited;
  const input = await parseJson(request, organizationChannelInputSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params; const id = await organizationId(context, slug);
  if (!id) return apiError(request, 404, "not_found", "Organization workspace not found.");
  const moderation=await authorizeSharedTextMutation(request,context,{surface:"organization_channel",operation:"create",fields:{name:input.name,description:input.description},idempotencyKey:input.idempotencyKey});if(moderation instanceof Response)return moderation;
  const { data, error } = await context.supabase.rpc("create_organization_channel", {
    target_organization: id, target_category: input.categoryId, submitted_name: input.name,
    submitted_description: input.description, submitted_type: input.type, submitted_visibility: input.visibility,
    submitted_slow_mode: input.slowModeSeconds, request_key: input.idempotencyKey,
  });
  if (error) return mutationError(request, error, "Unable to create this channel.");
  if (input.visibility === "restricted" && data) {
    for (const roleId of input.allowedRoleIds) {
      const result = await context.supabase.rpc("set_organization_channel_role_override", { target_channel: data, target_role: roleId, allow_view: true, allow_send: input.type === "text", allow_manage: false, allow_announcements: input.type === "announcement" });
      if (result.error) return mutationError(request, result.error, "The channel was created, but its role access could not be completed.");
    }
  }
  return apiData(request, { id: data }, 201);
}
