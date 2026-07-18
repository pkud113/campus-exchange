import { organizationInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const url = new URL(request.url); const q = url.searchParams.get("q")?.trim(); const campus = url.searchParams.get("campus") ?? "my";
  let query = context.supabase.from("organizations").select("id,campus_id,created_by,slug,name,description,website_url,avatar_media_id,banner_media_id,visibility,membership_policy,status,is_official,verified_at,member_count,created_at,campuses!inner(name,short_name,slug)").eq("status", "active").order("member_count", { ascending: false }).limit(50);
  if (campus === "my") query = query.eq("campus_id", context.campusId); else if (campus !== "all") query = query.eq("campuses.slug", campus);
  if (q) query = query.ilike("name", `%${q.replace(/[%_,()]/g, "")}%`);
  const { data, error } = await query;
  return error ? apiError(request, 500, "internal_error", "Unable to load organizations.") : apiData(request, data ?? []);
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "organization-create", context.userId, 5, 86400); if (limited) return limited;
  const input = await parseJson(request, organizationInputSchema); if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("create_organization", { submitted_slug: input.slug, submitted_name: input.name, submitted_description: input.description, submitted_visibility: input.visibility, submitted_policy: input.membershipPolicy, submitted_website: input.websiteUrl, request_key: input.idempotencyKey });
  if (error) return mutationError(request, error, "Unable to create this organization.");
  return apiData(request, { id: data, slug: input.slug }, 201);
}
