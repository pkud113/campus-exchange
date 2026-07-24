import { z } from "zod";
import { NextResponse } from "next/server";
import { apiData, apiError, mutationError, parseJson, requireStaffCapability, verifyMutationOrigin } from "@/lib/api";

const schema = z.object({
  key: z.string().trim().min(2).max(100),
  value: z.unknown(),
  reason: z.string().trim().min(10).max(2000),
  idempotencyKey: z.string().uuid()
}).strict();

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "settings.manage");
  if (context instanceof NextResponse) return context;
  const { data: definitions, error } = await context.supabase.rpc("admin_operational_settings");
  if (error) return apiError(request, 403, "forbidden", "Unable to load operational settings.");
  return apiData(request, definitions ?? []);
}

export async function PATCH(request: Request) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireStaffCapability(request, "settings.manage");
  if (context instanceof NextResponse) return context;
  const input = await parseJson(request, schema);
  if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.rpc("set_operational_setting", {
    selected_key: input.key,
    selected_value: input.value,
    submitted_reason: input.reason,
    request_key: input.idempotencyKey
  });
  return error ? mutationError(request, error, "Unable to update this allowlisted setting.") : apiData(request, data);
}
