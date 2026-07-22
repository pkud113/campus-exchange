import { organizationRoleAssignmentSchema, organizationRoleMutationSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

type Params = { params: Promise<{ slug: string }> };
export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, organizationRoleAssignmentSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { data: organization } = await context.supabase.from("organizations").select("id").eq("slug", slug.toLowerCase()).single();
  if (!organization) return apiError(request, 404, "not_found", "Organization not found.");
  const { error } = await context.supabase.rpc("assign_organization_role", { target_organization: organization.id, target_role: input.roleId, target_profile: input.profileId, chosen_action: input.action, action_reason: input.reason });
  return error ? mutationError(request, error, "Unable to update this role.") : apiData(request, { updated: true });
}

export async function PUT(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, organizationRoleMutationSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { data: organization } = await context.supabase.from("organizations").select("id").eq("slug", slug.toLowerCase()).single();
  if (!organization) return apiError(request, 404, "not_found", "Organization not found.");
  const { data, error } = await context.supabase.rpc("manage_organization_role", {
    target_organization: organization.id, target_role: input.roleId, chosen_action: input.action,
    submitted_name: input.name, submitted_color: input.color, submitted_position: input.sortPosition,
    submitted_rank: input.authorityRank, submitted_permissions: input.permissions,
  });
  return error ? mutationError(request, error, "Unable to update this custom role.") : apiData(request, { id: data, action: input.action });
}
