import { organizationChannelOverrideSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

type Params = { params: Promise<{ slug: string; channelId: string }> };
const resolved = (value: "inherit" | "allow" | "deny") => value === "inherit" ? null : value === "allow";

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, organizationChannelOverrideSchema); if (input instanceof NextResponse) return input;
  const { channelId } = await params;
  const args = {
    target_channel: channelId, allow_view: resolved(input.viewChannel), allow_send: resolved(input.sendMessages),
    allow_manage: resolved(input.manageMessages), allow_announcements: resolved(input.createAnnouncements),
  };
  const result = input.targetType === "role"
    ? await context.supabase.rpc("set_organization_channel_role_override", { ...args, target_role: input.targetId })
    : await context.supabase.rpc("set_organization_channel_member_override", { ...args, target_profile: input.targetId });
  return result.error ? mutationError(request, result.error, "Unable to update channel permissions.") : apiData(request, { updated: true });
}
