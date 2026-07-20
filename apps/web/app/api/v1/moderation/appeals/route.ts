import { moderationAppealSchema } from "@campus-exchange/contracts";
import { z } from "zod";
import { NextResponse } from "next/server";
import { apiData, apiError, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

const submitSchema = moderationAppealSchema.extend({ caseId: z.string().uuid() }).strict();

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.rpc("appealable_moderation_cases");
  return error ? apiError(request, 500, "internal_error", "Unable to load appeal options.") : apiData(request, data ?? []);
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, submitSchema); if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("submit_moderation_appeal", { target_case: input.caseId, submitted_statement: input.statement, request_key: input.idempotencyKey });
  return error ? mutationError(request, error, "This case is not currently appealable.") : apiData(request, { id: data, status: "open" }, 201);
}
