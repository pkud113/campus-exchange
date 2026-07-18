import { apiData, apiError, requireVerified } from "@/lib/api";
import { NextResponse } from "next/server";
type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { slug } = await params;
  const { data: organization, error } = await context.supabase.from("organizations").select("id,campus_id,created_by,slug,name,description,website_url,avatar_media_id,banner_media_id,visibility,membership_policy,status,is_official,verified_at,member_count,created_at,campuses(name,short_name,slug)").eq("slug", slug.toLowerCase()).single();
  if (error || !organization) return apiError(request, 404, "not_found", "Organization not found.");
  const { data: memberships } = await context.supabase.from("organization_memberships").select("profile_id,role,status,joined_at").eq("organization_id", organization.id).order("joined_at");
  const profileIds = (memberships ?? []).map((membership) => membership.profile_id);
  const { data: profiles } = profileIds.length ? await context.supabase.rpc("safe_profile_cards", { target_ids: profileIds }) : { data: [] };
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  return apiData(request, { ...organization, memberships: (memberships ?? []).map((membership) => ({ ...membership, profile: profileMap.get(membership.profile_id) ?? null })) });
}
