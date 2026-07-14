import { registrationStartSchema } from "@campus-exchange/contracts";
import { normalizeSchoolDomain } from "@campus-exchange/domain";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimit, parseJson, verifyMutationOrigin } from "@/lib/api";
import { sha256 } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, registrationStartSchema); if (input instanceof NextResponse) return input;
  const limited = await enforceRateLimit(request, "registration-otp", `${request.headers.get("cf-connecting-ip") ?? "local"}:${input.email}`, 5, 600); if (limited) return limited;
  const challengeError = await verifyTurnstile(request, input.turnstileToken); if (challengeError) return challengeError;
  try {
    const admin = createSupabaseAdminClient();
    const domain = normalizeSchoolDomain(input.email);
    const { data: campus } = await admin.from("campus_email_domains").select("campus_id").eq("domain", domain).maybeSingle();
    const emailHash = await sha256(input.email);
    const { data: staffInvite } = await admin.from("staff_invitations").select("id,claimed_at").eq("email_hash", emailHash).gt("expires_at",new Date().toISOString()).maybeSingle();
    if (!campus && !staffInvite) return apiError(request, 403, "forbidden", "That email is not eligible for Campus Exchange.");
    const { error } = await admin.auth.signInWithOtp({
      email: input.email,
      options: { shouldCreateUser: Boolean(campus), emailRedirectTo: `${process.env.APP_ORIGIN ?? new URL(request.url).origin}/auth/callback` }
    });
    if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") return apiError(request, 429, "rate_limited", "Too many verification emails were requested. Wait briefly and retry.");
    if (error) {
      console.error(JSON.stringify({ level: "error", event: "registration_otp_failed", requestId: request.headers.get("x-request-id") ?? "unknown", code: error.code ?? "unknown", status: error.status }));
      return apiError(request, 503, "service_unconfigured", "Email delivery is temporarily unavailable.");
    }
    return apiData(request, { sent: true });
  } catch {
    return apiError(request, 503, "service_unconfigured", "Registration is temporarily unavailable.");
  }
}
