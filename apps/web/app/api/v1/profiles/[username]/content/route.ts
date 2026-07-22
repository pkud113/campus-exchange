import { cursorSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, decodeCursor, encodeCursor, requireVerified } from "@/lib/api";

type Params = { params: Promise<{ username: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { username } = await params; const url = new URL(request.url); const tab = url.searchParams.get("tab") ?? "posts";
  if (!["posts", "listings", "events", "organizations", "about"].includes(tab)) return apiError(request, 400, "bad_request", "Choose a valid profile tab.");
  const parsed = cursorSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Invalid profile pagination.");
  const { data: profiles, error: profileError } = await context.supabase.rpc("safe_profile_by_username", { target_username: username.toLowerCase() });
  const profile = profiles?.[0];
  if (profileError || !profile) return apiError(request, 404, "not_found", "Profile not found.");
  const own = profile.id === context.userId; const cursor = decodeCursor(parsed.data.cursor); const limit = parsed.data.limit;

  if (!own && !profile.activity_visible && !["about", "organizations"].includes(tab)) {
    return apiData(request, { items: [], nextCursor: null, privacyRestricted: true });
  }

  if (tab === "organizations") {
    const { data: memberships } = await context.supabase.rpc("profile_organization_memberships", { target_profile: profile.id });
    const visible = (memberships ?? []).filter((membership: any) => !cursor || membership.joined_at < cursor.createdAt || (membership.joined_at === cursor.createdAt && membership.id < cursor.id));
    const page = visible.slice(0, limit); const last = page.at(-1);
    return apiData(request, { items: page, nextCursor: visible.length > limit && last ? encodeCursor(last.joined_at, last.id) : null, privacyRestricted: !own && !profile.organization_memberships_visible });
  }
  if (tab === "about") return apiData(request, { items: [], nextCursor: null });
  if (tab === "posts") {
    let query = context.supabase.from("social_posts").select("id,body,visibility,status,reaction_count,comment_count,edited_at,created_at,social_post_media(media_id,position)").eq("author_profile_id", profile.id).is("organization_id", null).eq("status", "active").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query; if (error) return apiError(request, 500, "internal_error", "Unable to load profile posts.");
    const rows = data ?? []; const page = rows.slice(0, limit); const last = page.at(-1);
    return apiData(request, { items: page, nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null });
  }
  if (tab === "listings") {
    let query = context.supabase.from("listings").select("id,title,description,category,condition,price_cents,currency,status,visibility,created_at,campuses(name,short_name)").eq("seller_id", profile.id).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (!own) query = query.eq("status", "active");
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query; if (error) return apiError(request, 500, "internal_error", "Unable to load profile listings.");
    const rows = data ?? []; const page = rows.slice(0, limit); const { data: media } = page.length ? await context.supabase.rpc("safe_listing_media", { target_ids: page.map((row) => row.id) }) : { data: [] }; const last = page.at(-1);
    return apiData(request, { items: page.map((row) => ({ ...row, media: (media ?? []).filter((item: any) => item.listing_id === row.id) })), nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null });
  }

  const { data: memberships } = await context.supabase.rpc("profile_organization_memberships", { target_profile: profile.id });
  const managedOrganizationIds = (memberships ?? []).filter((membership: any) => ["owner", "administrator"].includes(membership.role)).map((membership: any) => membership.id);
  let query = context.supabase.from("events").select("id,title,description,location,starts_at,ends_at,cancelled_at,deleted_at,visibility,organization_id,created_at").is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  query = managedOrganizationIds.length ? query.or(`organizer_id.eq.${profile.id},organization_id.in.(${managedOrganizationIds.join(",")})`) : query.eq("organizer_id", profile.id);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const { data, error } = await query; if (error) return apiError(request, 500, "internal_error", "Unable to load profile events.");
  const rows = data ?? []; const page = rows.slice(0, limit); const last = page.at(-1);
  return apiData(request, { items: page, nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null });
}
