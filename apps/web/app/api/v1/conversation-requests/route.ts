import { conversationRequestInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const box = new URL(request.url).searchParams.get("box") ?? "incoming";
  if (!new Set(["incoming", "sent"]).has(box)) return apiError(request, 400, "bad_request", "Choose incoming or sent requests.");
  const { data, error } = await context.supabase.rpc("conversation_request_box", { requested_box: box });
  return error ? apiError(request, 500, "internal_error", "Unable to load message requests.") : apiData(request, data ?? []);
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, conversationRequestInputSchema); if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("create_conversation_request", {
    target_profile: input.profileId,
    opening_message: input.openingMessage,
    idempotency_key: input.idempotencyKey,
    context_type: input.context?.type ?? "direct",
    context_id: input.context?.id ?? null,
  });
  if (error?.code === "23505") return apiError(request, 409, "conflict", "A pending request already exists.");
  if (error?.code === "P0001") return apiError(request, 429, "rate_limited", "You have reached today’s message-request limit.");
  return error ? apiError(request, 409, "conflict", "This request is unavailable right now.") : apiData(request, data, data?.state === "existing" ? 200 : 201);
}
