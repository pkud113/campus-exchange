import { organizationMembershipInputSchema } from "@campus-exchange/contracts";
import { apiData, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "organization-membership", context.userId, 60, 3600); if (limited) return limited;
  const input = await parseJson(request, organizationMembershipInputSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { data: organization } = await context.supabase.from("organizations").select("id,name").eq("slug", slug.toLowerCase()).single();
  if (!organization) return mutationError(request, { code: "P0002", message: "organization unavailable" }, "Organization not found.");
  let targetProfile = input.profileId ?? null;
  if (!targetProfile && input.profileHandle) {
    const { data: profiles } = await context.supabase.rpc("safe_profile_by_username", { target_username: input.profileHandle });
    targetProfile = profiles?.[0]?.id ?? null;
    if (!targetProfile) return mutationError(request, { code: "P0002", message: "profile unavailable" }, "That student is not available to invite.");
  }
  const mutation = input.action === "transfer_ownership"
    ? context.supabase.rpc("transfer_organization_ownership", { target_organization: organization.id, target_successor: targetProfile, submitted_confirmation: input.confirmation ?? "", request_key: input.idempotencyKey })
    : context.supabase.rpc("set_organization_membership", { target_organization: organization.id, target_profile: targetProfile, chosen_action: input.action === "request" ? "join" : input.action, chosen_role: input.role ?? null, request_key: input.idempotencyKey });
  const { data, error } = await mutation;
  if (error) return mutationError(request, error, "Unable to update organization membership.");
  return apiData(request, data?.[0] ?? null);
}
