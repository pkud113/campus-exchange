import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireStaffCapability, verifyMutationOrigin } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().email().max(320),
  campusId: z.string().uuid(),
  reason: z.string().trim().min(10).max(2000),
  idempotencyKey: z.string().uuid()
}).strict();

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireStaffCapability(request, "campus_moderators.manage");
  if (context instanceof NextResponse) return context;
  const input = await parseJson(request, schema);
  if (input instanceof NextResponse) return input;
  const emailHash = createHash("sha256").update(input.email.toLowerCase()).digest("hex");
  const { data, error } = await context.supabase.rpc("invite_campus_moderator", {
    normalized_email_hash: emailHash,
    target_campus: input.campusId,
    submitted_reason: input.reason,
    request_key: input.idempotencyKey
  });
  return error ? mutationError(request, error, "Unable to create this moderator invitation.") : apiData(request, { invitationId: data });
}
