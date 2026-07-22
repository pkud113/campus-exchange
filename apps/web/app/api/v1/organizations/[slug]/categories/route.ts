import { organizationCategoryInputSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "organization-category-create", context.userId, 30, 3600); if (limited) return limited;
  const input = await parseJson(request, organizationCategoryInputSchema); if (input instanceof NextResponse) return input;
  const { slug } = await params;
  const { data: organization } = await context.supabase.from("organizations").select("id").eq("slug", slug.toLowerCase()).single();
  if (!organization) return apiError(request, 404, "not_found", "Organization workspace not found.");
  const moderation=await authorizeSharedTextMutation(request,context,{surface:"organization_category",operation:"create",fields:{name:input.name},idempotencyKey:input.idempotencyKey});if(moderation instanceof Response)return moderation;
  const { data, error } = await context.supabase.rpc("create_organization_category", {
    target_organization: organization.id,
    submitted_name: input.name,
    submitted_position: input.sortPosition,
    request_key: input.idempotencyKey,
  });
  if (error) return mutationError(request, error, "Unable to create this category.");
  return apiData(request, { id: data }, 201);
}
