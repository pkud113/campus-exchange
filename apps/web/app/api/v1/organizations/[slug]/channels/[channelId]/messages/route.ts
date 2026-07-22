import { cursorSchema, organizationMessageInputSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, decodeCursor, encodeCursor, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

type Params = { params: Promise<{ slug: string; channelId: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { channelId } = await params;
  const parsed = cursorSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Invalid message pagination.");
  const cursor = decodeCursor(parsed.data.cursor);
  let query = context.supabase.from("organization_channel_messages").select("id,organization_id,channel_id,author_profile_id,parent_message_id,body,edited_at,deleted_at,created_at").eq("channel_id", channelId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(parsed.data.limit + 1);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) return apiError(request, 404, "not_found", "Channel unavailable.");
  const rows = data ?? []; const page = rows.slice(0, parsed.data.limit); const authorIds = page.flatMap((row) => row.author_profile_id ? [row.author_profile_id] : []);
  const { data: authors } = authorIds.length ? await context.supabase.rpc("safe_profile_cards", { target_ids: authorIds }) : { data: [] };
  const authorMap = new Map((authors ?? []).map((author: any) => [author.id, author]));
  await context.supabase.rpc("mark_organization_channel_read", { target_channel: channelId });
  const last = page.at(-1);
  return apiData(request, { items: page.reverse().map((row) => ({ ...row, author: row.author_profile_id ? authorMap.get(row.author_profile_id) ?? null : null })), nextCursor: rows.length > parsed.data.limit && last ? encodeCursor(last.created_at, last.id) : null });
}

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(request, "organization-channel-message", context.userId, 120, 60); if (limited) return limited;
  const input = await parseJson(request, organizationMessageInputSchema); if (input instanceof NextResponse) return input;
  const { channelId } = await params;
  const { data, error } = await context.supabase.rpc("send_organization_channel_message", { target_channel: channelId, parent_message: input.parentMessageId, submitted_body: input.body, request_key: input.idempotencyKey });
  return error ? mutationError(request, error, "Unable to send this message.") : apiData(request, { id: data }, 201);
}
