import { discussionCommunityInputSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, discussionMutationError, enforceRateLimit, parseJson, requireDiscussions, verifyMutationOrigin } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const url = new URL(request.url); const q = url.searchParams.get("q")?.trim(); const sort = url.searchParams.get("sort") === "new" ? "new" : "popular";
  let query = context.supabase.from("discussion_communities").select("*").eq("status", "active").eq("visibility", "campus_private").is("deleted_at", null).limit(30);
  if (q) query = query.or(`display_name.ilike.*${q.replace(/[%_,.*]/g, "")}*,slug.ilike.*${q.replace(/[%_,.*]/g, "")}*`);
  query = sort === "new" ? query.order("created_at", { ascending: false }).order("id", { ascending: false }) : query.order("member_count", { ascending: false }).order("post_count", { ascending: false }).order("id", { ascending: false });
  const { data, error } = await query;
  return error ? apiError(request, 500, "internal_error", "Unable to load communities.") : apiData(request, data ?? []);
}

export async function POST(request: Request) {
  const origin = verifyMutationOrigin(request); if (origin) return origin;
  const context = await requireDiscussions(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "discussion-community-create", context.userId, 3, 86400); if (limited) return limited;
  const input = await parseJson(request, discussionCommunityInputSchema); if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("create_discussion_community", { submitted_slug: input.slug, submitted_name: input.displayName, submitted_description: input.description, submitted_rules: input.rules, submitted_permission: input.postingPermission, submitted_key: input.idempotencyKey });
  if (error) return discussionMutationError(request, error, "Unable to create this community.");
  return apiData(request, data, 201);
}
