import { onboardingInputSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, parseJson, verifyMutationOrigin } from "@/lib/api";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";

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
    if (profile.handle && profile.handle.toLowerCase() !== input.username) return apiError(request, 409, "conflict", "Your existing username cannot be changed.");
    if (!profile.handle) {
      const moderation = await authorizeSharedTextMutation(request, { userId: auth.user.id, campusId: profile.campus_id }, { surface: "profile", operation: "edit", fields: { username: input.username }, targetId: auth.user.id });
      if (moderation instanceof Response) return moderation;
    }
    const { error: passwordError } = await supabase.auth.updateUser({ password: input.password });
    if (passwordError) return apiError(request, 400, "bad_request", "Choose a stronger password that you have not used before.");
    const { error } = await supabase.rpc("complete_onboarding", { new_handle: profile.handle ?? input.username });
    if (error?.code === "23505") return apiError(request, 409, "conflict", "That username is already taken.");
    if (error) return apiError(request, 409, "conflict", error.message);
    return apiData(request, { completed: true, next: "/home" });
  } catch {
    return apiError(request, 503, "service_unconfigured", "Account setup is temporarily unavailable.");
  }
}
