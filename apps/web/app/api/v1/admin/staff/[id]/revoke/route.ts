import { z } from "zod";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireStaffCapability, verifyMutationOrigin } from "@/lib/api";

const schema = z.object({ reason: z.string().trim().min(10).max(2000), idempotencyKey: z.string().uuid() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireStaffCapability(request, "campus_moderators.manage");
  if (context instanceof NextResponse) return context;
  const input = await parseJson(request, schema);
  if (input instanceof NextResponse) return input;
  const { id } = await params;
  const { data, error } = await context.supabase.rpc("revoke_campus_moderator", {
    target_profile: id,
    submitted_reason: input.reason,
    request_key: input.idempotencyKey
  });
  return error ? mutationError(request, error, "Unable to revoke this moderator role.") : apiData(request, { operationalCaseId: data });
}
