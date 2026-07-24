import { channelReactionInputSchema, uuidSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

export async function GET(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const { messageId } = await params;
  if (!uuidSchema.safeParse(messageId).success) return apiError(request, 400, "bad_request", "Invalid message.");
  const { data, error } = await context.supabase.rpc("organization_message_reaction_summary", { target_message: messageId });
  return error
    ? apiError(request, 404, "not_found", "Message unavailable.")
    : apiData(request, data ?? []);
}

export async function POST(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const { messageId } = await params;
  if (!uuidSchema.safeParse(messageId).success) return apiError(request, 400, "bad_request", "Invalid message.");
  const input = await parseJson(request, channelReactionInputSchema);
  if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("toggle_organization_message_reaction", {
    target_message: messageId,
    selected_emoji: input.emoji
  });
  return error ? mutationError(request, error, "Unable to update this reaction.") : apiData(request, data);
}
