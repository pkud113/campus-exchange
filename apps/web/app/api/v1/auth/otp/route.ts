import { z } from "zod";
import { apiData, apiError, enforceRateLimit, parseJson, verifyMutationOrigin } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeSchoolDomain } from "@campus-exchange/domain";
import { NextResponse } from "next/server";

const schema = z.object({ email: z.string().trim().email().max(254), turnstileToken: z.string().max(2048).optional() });

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, schema); if (input instanceof NextResponse) return input;
  const limited = await enforceRateLimit(request,"otp",`${request.headers.get("cf-connecting-ip")??"local"}:${input.email.toLowerCase()}`,5,600); if(limited)return limited;
  try {
    const domain = normalizeSchoolDomain(input.email);
    const admin = createSupabaseAdminClient();
    const { data: allowed } = await admin.from("campus_email_domains").select("campus_id").eq("domain", domain).maybeSingle();
    if (!allowed) return apiError(request, 403, "forbidden", "That school email domain is not enabled for this campus.");
    if (process.env.TURNSTILE_SECRET_KEY) {
      const body = new FormData(); body.set("secret", process.env.TURNSTILE_SECRET_KEY); body.set("response", input.turnstileToken ?? "");
      const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
      const verdict = await result.json() as { success?: boolean };
      if (!verdict.success) return apiError(request, 400, "bad_request", "Human verification failed. Please retry.");
    }
    const { error } = await admin.auth.signInWithOtp({ email: input.email, options: { emailRedirectTo: `${process.env.APP_ORIGIN ?? new URL(request.url).origin}/auth/callback` } });
    if (error) {
      console.error(JSON.stringify({ level: "error", event: "otp_send_failed", requestId: request.headers.get("x-request-id") ?? "unknown", code: error.code ?? "unknown", status: error.status }));
      if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") return apiError(request, 429, "rate_limited", "Too many sign-in emails were requested. Wait briefly and retry.");
      return apiError(request, 503, "service_unconfigured", "Email delivery is temporarily unavailable. Please try again shortly.");
    }
    return apiData(request, { sent: true });
  } catch { return apiError(request, 503, "service_unconfigured", "Student verification is not configured yet."); }
}
