import { z } from "zod";
import { NextResponse } from "next/server";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

const schema = z.object({
  announcements: z.boolean(),
  mentions: z.boolean(),
  membershipChanges: z.boolean(),
  mutedUntil: z.string().datetime().nullable()
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const input = await parseJson(request, schema);
  if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { data: organization } = await context.supabase.from("organizations").select("id").eq("slug", slug.toLowerCase()).single();
  if (!organization) return apiError(request, 404, "not_found", "Organization not found.");
  const { data, error } = await context.supabase.from("organization_notification_preferences").update({
    announcements: input.announcements,
    mentions: input.mentions,
    membership_changes: input.membershipChanges,
    muted_until: input.mutedUntil,
    updated_at: new Date().toISOString()
  }).eq("organization_id", organization.id).eq("profile_id", context.userId).select("announcements,mentions,membership_changes,muted_until").single();
  return error ? apiError(request, 403, "forbidden", "Active organization membership is required.") : apiData(request, data);
}
