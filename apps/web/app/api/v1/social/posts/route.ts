import { socialFeedQuerySchema, socialPostInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, decodeCursor, encodeCursor, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { hydrateSocialPosts, type SocialPostRow } from "@/lib/social";
import { NextResponse } from "next/server";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const parsed = socialFeedQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Invalid pagination parameters.");
  const cursor = decodeCursor(parsed.data.cursor);
  const { data, error } = await context.supabase.rpc("social_feed_filtered", {
    before_created: cursor?.createdAt ?? null,
    before_id: cursor?.id ?? null,
    result_limit: parsed.data.limit + 1,
    selected_scope: parsed.data.scope,
    target_author: parsed.data.author ?? null,
  });
  if (error) return apiError(request, 500, "internal_error", "Unable to load the social feed.");
  const rows = (data ?? []) as SocialPostRow[]; const page = rows.slice(0, parsed.data.limit);
  const items = await hydrateSocialPosts(context.supabase, context.userId, page);
  const last = page.at(-1);
  return apiData(request, { items, nextCursor: rows.length > parsed.data.limit && last ? encodeCursor(last.created_at, last.id) : null });
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "social-post", context.userId, 30, 3600); if (limited) return limited;
  const input = await parseJson(request, socialPostInputSchema); if (input instanceof NextResponse) return input;
  const moderation=await authorizeSharedTextMutation(request,context,{surface:"social_post",operation:"create",fields:{body:input.body},idempotencyKey:input.idempotencyKey});if(moderation instanceof Response)return moderation;
  const { data, error } = await context.supabase.rpc("create_social_post", { submitted_body: input.body, submitted_media: input.mediaIds, submitted_visibility: input.visibility, submitted_organization: input.organizationId, request_key: input.idempotencyKey });
  if (error) return mutationError(request, error, "Unable to publish this post.");
  const { data: row } = await context.supabase.from("social_posts").select("*").eq("id", data).single();
  const [post] = row ? await hydrateSocialPosts(context.supabase, context.userId, [row as SocialPostRow]) : [];
  return apiData(request, post ?? { id: data }, 201);
}
