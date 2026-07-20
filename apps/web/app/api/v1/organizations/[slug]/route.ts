import { apiData, apiError, requireVerified } from "@/lib/api";
import { NextResponse } from "next/server";
type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { slug } = await params;
  const { data: organization, error } = await context.supabase.from("organizations").select("id,campus_id,created_by,slug,name,description,rules,organization_type,external_links,website_url,avatar_media_id,banner_media_id,visibility,membership_policy,status,is_read_only,restriction_reason,is_official,verified_at,member_count,created_at,campuses(name,short_name,slug)").eq("slug", slug.toLowerCase()).single();
  if (error || !organization) return apiError(request, 404, "not_found", "Organization not found.");
  const [{ data: members }, { data: membershipQueue }, { data: viewerMembership }, { data: events }, { data: posts }, { data: viewerCapabilities }] = await Promise.all([
    context.supabase.rpc("organization_member_directory", { target_organization: organization.id }),
    context.supabase.rpc("organization_membership_queue", { target_organization: organization.id }),
    context.supabase.from("organization_memberships").select("id,profile_id,role,status,joined_at").eq("organization_id", organization.id).eq("profile_id", context.userId).maybeSingle(),
    context.supabase.from("events").select("id,title,location,starts_at,ends_at,cancelled_at").eq("organization_id", organization.id).is("deleted_at", null).gte("starts_at", new Date().toISOString()).order("starts_at").limit(6),
    context.supabase.from("social_posts").select("id,body,reaction_count,comment_count,created_at").eq("organization_id", organization.id).eq("status", "active").order("created_at", { ascending: false }).limit(6),
    context.supabase.rpc("organization_viewer_capabilities", { target_organization: organization.id }),
  ]);
  return apiData(request, { ...organization, members: members ?? [], membershipQueue: membershipQueue ?? [], viewerMembership: viewerMembership ?? null, viewerCapabilities: viewerCapabilities?.[0] ?? null, upcomingEvents: events ?? [], recentPosts: posts ?? [] });
}
