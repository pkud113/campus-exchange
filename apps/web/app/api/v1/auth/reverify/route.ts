import { apiData, apiError, verifyMutationOrigin } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  try {
    const db = await createSupabaseServerClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return apiError(request, 401, "unauthorized", "Verify your email before continuing.");
    const { data: profile } = await db.from("profiles").select("account_kind,onboarding_completed_at,password_setup_required").eq("id", user.id).single();
    if (!profile) return apiError(request, 404, "not_found", "Account profile not found.");
    if (!profile.onboarding_completed_at || profile.password_setup_required) return apiData(request, { next: "/onboarding" });
    if (profile.account_kind === "student") {
      const { error } = await db.rpc("reverify_student");
      if (error) return apiError(request, 403, "forbidden", "Student verification could not be renewed.");
    }
    return apiData(request, { next: "/home" });
  } catch {
    return apiError(request, 503, "service_unconfigured", "Student verification is temporarily unavailable.");
  }
}
