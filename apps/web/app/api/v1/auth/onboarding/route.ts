import { evaluateUsernameSafety, normalizeUsernameInput, onboardingInputSchema, usernameSafetyMessage } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, parseJson, verifyMutationOrigin } from "@/lib/api";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, onboardingInputSchema); if (input instanceof NextResponse) return input;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return apiError(request, 401, "unauthorized", "Verify your email before completing account setup.");
    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin.from("profiles").select("campus_id,handle,onboarding_completed_at,password_setup_required").eq("id", auth.user.id).single();
    if (!profile) return apiError(request, 404, "not_found", "Account profile not found.");
    if (profile.onboarding_completed_at && !profile.password_setup_required) return apiError(request, 409, "conflict", "Account setup is already complete.");
    let normalizedUsername = normalizeUsernameInput(input.username);
    if (profile.handle) {
      if (profile.handle.toLowerCase() !== normalizedUsername) return apiError(request, 409, "conflict", "Your existing username cannot be changed.");
      normalizedUsername = profile.handle.toLowerCase();
    } else {
      const safety = evaluateUsernameSafety(input.username);
      if (!safety.ok) return apiError(request, 422, "invalid_username", usernameSafetyMessage(safety.reason), { reason: safety.reason });
      normalizedUsername = safety.username;
      const { data: duplicate, error: duplicateError } = await admin.from("profiles").select("id").eq("handle", normalizedUsername).neq("id", auth.user.id).limit(1).maybeSingle();
      if (duplicateError) return apiError(request, 503, "service_unavailable", "Username availability is temporarily unavailable.");
      if (duplicate) return apiError(request, 409, "conflict", "That username is already taken.");
    }
    const { error: passwordError } = await supabase.auth.updateUser({ password: input.password });
    if (passwordError) return apiError(request, 400, "bad_request", "Choose a stronger password that you have not used before.");
    const { error } = await supabase.rpc("complete_onboarding", { new_handle: normalizedUsername });
    if (error?.code === "23505") return apiError(request, 409, "conflict", "That username is already taken.");
    if (error?.code === "22023") return apiError(request, 422, "invalid_username", "That username cannot be used.");
    if (error) return apiError(request, 409, "conflict", error.message);
    return apiData(request, { completed: true, next: "/home" });
  } catch {
    return apiError(request, 503, "service_unconfigured", "Account setup is temporarily unavailable.");
  }
}
