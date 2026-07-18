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
  const { data: organization } = await context.supabase.from("organizations").select("id").eq("slug", slug.toLowerCase()).single();
  if (!organization) return mutationError(request, { code: "P0002", message: "organization unavailable" }, "Organization not found.");
  const { data, error } = await context.supabase.rpc("set_organization_membership", { target_organization: organization.id, target_profile: input.profileId ?? null, chosen_action: input.action === "request" ? "join" : input.action, chosen_role: input.role ?? null, request_key: input.idempotencyKey });
  if (error) return mutationError(request, error, "Unable to update organization membership.");
  return apiData(request, data?.[0] ?? null);
}
