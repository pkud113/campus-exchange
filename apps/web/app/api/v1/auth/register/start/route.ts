import { registrationStartSchema } from "@campus-exchange/contracts";
import { decideInstitutionRegistration, normalizeSchoolDomain } from "@campus-exchange/domain";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimit, parseJson, verifyMutationOrigin } from "@/lib/api";
import { sha256 } from "@/lib/auth";
import { beginInstitutionDomainVerification } from "@/lib/institution-verification";
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
    const { data: institution, error: institutionError } = await admin.from("institution_directory")
      .select("id,name,status,registration_status,campus_id")
      .eq("id", input.institutionId)
      .maybeSingle();
    if (institutionError) throw institutionError;
    if (!institution) return apiError(request, 400, "bad_request", "Select a college from the directory.");
    const { data: resolutions, error: resolutionError } = await admin.rpc("registration_domain_resolution", { input_domain: domain });
    if (resolutionError) throw resolutionError;
    const resolution = resolutions?.[0] as { resolution?: string; campus_id?: string; campus_name?: string } | undefined;
    const emailHash = await sha256(input.email);
    const { data: staffInvite } = await admin.from("staff_invitations").select("id,claimed_at").eq("email_hash", emailHash).gt("expires_at",new Date().toISOString()).maybeSingle();
    const reason = resolution?.resolution ?? "unsupported";
    const decision = decideInstitutionRegistration({
      staffInvite: Boolean(staffInvite),
      institutionRegistrationStatus: institution.registration_status,
      selectedCampusId: institution.campus_id,
      resolution: reason,
      resolvedCampusId: resolution?.campus_id ?? null
    });
    if (decision === "institution_unavailable") return apiError(request, 403, "forbidden", "This institution is not currently accepting registrations or domain-verification requests.", { reason: "institution_unavailable" });
    if (decision === "mismatch") return apiError(request, 403, "forbidden", "That school email domain is approved for a different college. Check your selection.", { reason: "institution_domain_mismatch" });
    if (decision === "alumni") return apiError(request, 403, "forbidden", "Alumni email domains do not qualify for student registration.", { reason: "alumni_domain" });
    if (decision === "campus_disabled") return apiError(request, 403, "forbidden", "This campus is not currently accepting registrations.", { reason: "campus_disabled" });
    if (decision === "domain_disabled") return apiError(request, 403, "forbidden", "Registration for this school email domain is currently disabled.", { reason: "domain_disabled" });
    if (decision === "pending_review") {
      const verification = await beginInstitutionDomainVerification({
        institutionId: institution.id,
        institutionName: institution.name,
        email: input.email,
        domain,
        requesterAddress: request.headers.get("cf-connecting-ip") ?? "local"
      });
      return apiData(request, {
        sent: true,
        verificationKind: "domain",
        challengeId: verification.challengeId,
        expiresAt: verification.expiresAt,
        reason: reason === "ambiguous" ? "shared_domain" : "domain_review_required"
      }, 202);
    }
    const { error } = await admin.auth.signInWithOtp({
      email: input.email,
      options: { shouldCreateUser: true, emailRedirectTo: `${process.env.APP_ORIGIN ?? new URL(request.url).origin}/auth/callback` }
    });
    if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") return apiError(request, 429, "rate_limited", "Too many verification emails were requested. Wait briefly and retry.");
    if (error) {
      console.error(JSON.stringify({ level: "error", event: "registration_otp_failed", requestId: request.headers.get("x-request-id") ?? "unknown", code: error.code ?? "unknown", status: error.status }));
      return apiError(request, 503, "service_unconfigured", "Email delivery is temporarily unavailable.");
    }
    return apiData(request, { sent: true, verificationKind: "registration" });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "registration_start_failed", requestId: request.headers.get("x-request-id") ?? "unknown", code: error instanceof Error ? error.message : "unknown" }));
    return apiError(request, 503, "service_unconfigured", "Registration is temporarily unavailable.");
  }
}
