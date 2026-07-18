import { cursorSchema, socialPostInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, decodeCursor, encodeCursor, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

type SocialPostRow = { id: string; author_profile_id: string; created_at: string; [key: string]: unknown };

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const parsed = cursorSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Invalid pagination parameters.");
  const cursor = decodeCursor(parsed.data.cursor);
  const { data, error } = await context.supabase.rpc("social_feed", { before_created: cursor?.createdAt ?? null, before_id: cursor?.id ?? null, result_limit: parsed.data.limit + 1 });
  if (error) return apiError(request, 500, "internal_error", "Unable to load the social feed.");
  const rows = (data ?? []) as SocialPostRow[]; const page = rows.slice(0, parsed.data.limit); const authorIds = page.map((post) => post.author_profile_id); const postIds = page.map((post) => post.id);
  const [{ data: authors }, { data: viewerReactions }] = postIds.length ? await Promise.all([
    context.supabase.rpc("safe_profile_cards", { target_ids: authorIds }),
    context.supabase.from("social_reactions").select("post_id,reaction").eq("profile_id", context.userId).in("post_id", postIds),
  ]) : [{ data: [] }, { data: [] }];
  const authorMap = new Map((authors ?? []).map((author: any) => [author.id, author]));
  const reactionMap = new Map((viewerReactions ?? []).map((reaction) => [reaction.post_id, reaction.reaction]));
  const last = page.at(-1);
  return apiData(request, { items: page.map((post) => ({ ...post, author: authorMap.get(post.author_profile_id) ?? null, viewerReaction: reactionMap.get(post.id) ?? null })), nextCursor: rows.length > parsed.data.limit && last ? encodeCursor(last.created_at, last.id) : null });
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "social-post", context.userId, 30, 3600); if (limited) return limited;
  const input = await parseJson(request, socialPostInputSchema); if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("create_social_post", { submitted_body: input.body, submitted_media: input.mediaIds, submitted_visibility: input.visibility, submitted_organization: input.organizationId, request_key: input.idempotencyKey });
  if (error) return mutationError(request, error, "Unable to publish this post.");
  return apiData(request, { id: data }, 201);
}
