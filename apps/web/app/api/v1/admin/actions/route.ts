import { auditedAdminActionSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireStaffCapability, verifyMutationOrigin } from "@/lib/api";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireStaffCapability(request, "cases.act");
  if (context instanceof NextResponse) return context;
  const input = await parseJson(request, auditedAdminActionSchema);
  if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("apply_admin_operational_action", {
    selected_action: input.action,
    selected_target_type: input.targetType,
    selected_target_id: input.targetId,
    submitted_reason: input.reason,
    request_key: input.idempotencyKey
  });
  return error ? mutationError(request, error, "Unable to apply the audited administrative action.") : apiData(request, { operationalCaseId: data });
}
