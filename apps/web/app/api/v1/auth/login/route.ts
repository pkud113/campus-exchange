import { loginInputSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimit, parseJson, verifyMutationOrigin } from "@/lib/api";
import { resolveLoginEmail } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, loginInputSchema); if (input instanceof NextResponse) return input;
  const limited = await enforceRateLimit(request, "password-login", `${request.headers.get("cf-connecting-ip") ?? "local"}:${input.identifier.toLowerCase()}`, 10, 600); if (limited) return limited;
  const challengeError = await verifyTurnstile(request, input.turnstileToken); if (challengeError) return challengeError;
  try {
    const email = await resolveLoginEmail(input.identifier);
    if (!email) return apiError(request, 401, "unauthorized", "The email/username or password is incorrect.");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: input.password });
    if (error || !data.user) return apiError(request, 401, "unauthorized", "The email/username or password is incorrect.");
    const [{ data: profile }, { data: authV2Enforced }] = await Promise.all([supabase.from("profiles").select("status,onboarding_completed_at,password_setup_required").eq("id", data.user.id).maybeSingle(),supabase.rpc("auth_v2_enforced")]);
    if (!profile?.onboarding_completed_at || profile.status !== "active" || (authV2Enforced === true && profile.password_setup_required)) {
      await supabase.auth.signOut({ scope: "local" });
      return apiError(request, 403, "forbidden", "Complete account setup before signing in with a password.");
    }
    return apiData(request, { authenticated: true, next: "/home" });
  } catch {
    return apiError(request, 503, "service_unconfigured", "Sign-in is temporarily unavailable.");
  }
}
