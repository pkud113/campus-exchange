import { passwordResetCompleteSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, parseJson, verifyMutationOrigin } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, passwordResetCompleteSchema); if (input instanceof NextResponse) return input;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return apiError(request, 401, "unauthorized", "Verify the recovery code before choosing a new password.");
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return apiError(request, 400, "bad_request", "Choose a stronger password that you have not used before.");
  await supabase.auth.signOut({ scope: "others" });
  return apiData(request, { updated: true, next: "/home" });
}
