import { registrationStartSchema } from "@campus-exchange/contracts";
import { decideInstitutionRegistration, normalizeSchoolDomain, registrationOutcomeMessages } from "@campus-exchange/domain";
import type { RegistrationOutcome } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimits, parseJson, verifyMutationOrigin } from "@/lib/api";
import { sha256 } from "@/lib/auth";
import { beginInstitutionDomainVerification } from "@/lib/institution-verification";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, registrationStartSchema); if (input instanceof NextResponse) return input;
  const clientAddress = request.headers.get("cf-connecting-ip") ?? "local";
  const emailDomain = normalizeSchoolDomain(input.email);
  const limited = await enforceRateLimits(request, [
    { scope: "registration-otp-ip", subject: clientAddress, limit: 20, windowSeconds: 600 },
    { scope: "registration-otp-account", subject: input.email, limit: 5, windowSeconds: 600 },
    { scope: "registration-otp-domain", subject: emailDomain, limit: 100, windowSeconds: 3600 }
  ]); if (limited) return limited;
  const challengeError = await verifyTurnstile(request, input.turnstileToken); if (challengeError) return challengeError;
  try {
    const admin = createSupabaseAdminClient();
    const domain = emailDomain;
    const { data: institution, error: institutionError } = await admin.from("institution_directory")
      .select("id,name,status,registration_status,campus_id")
      .eq("id", input.institutionId)
      .maybeSingle();
    if (institutionError) throw institutionError;
    if (!institution) return apiError(request, 400, "bad_request", "Select a college from the directory.");
    if (institution.status !== "active" || institution.registration_status !== "open") {
      return apiError(request, 403, "forbidden", "Registration is not open for this institution.", {
        outcome: "CAMPUS_REGISTRATION_PAUSED",
        institution: institution.name,
        domain
      });
    }
    const { data: universalSetting } = await admin.from("runtime_settings")
      .select("value")
      .eq("key", "universal_onboarding_enabled")
      .maybeSingle();
    const universalEnabled = universalSetting?.value === true;
    if (universalEnabled) {
      const requesterHash = await sha256(clientAddress);
      const emailHash = await sha256(input.email);
      const { data: grantRows, error: grantError } = await admin.rpc("create_registration_enrollment_grant", {
        selected_institution_id: institution.id,
        normalized_email_hash: emailHash,
        normalized_email_domain: domain,
        normalized_requester_hash: requesterHash
      });
      if (grantError) {
        const denied = grantError.message.includes("consumer") || grantError.message.includes("disposable");
        return apiError(request, denied ? 403 : 400, denied ? "forbidden" : "bad_request", denied
          ? "Use an institution-issued mailbox. Consumer and disposable email providers are not eligible."
          : "This institution and email combination is not eligible for registration.");
      }
      const grant = grantRows?.[0] as { grant_id: string; assignment_basis: string; expires_at: string } | undefined;
      if (!grant) throw new Error("enrollment_grant_not_created");
      const { error: otpError } = await admin.auth.signInWithOtp({
        email: input.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${process.env.APP_ORIGIN ?? new URL(request.url).origin}/auth/callback`,
          data: { registrationGrantId: grant.grant_id }
        }
      });
      if (otpError?.code === "over_email_send_rate_limit" || otpError?.code === "over_request_rate_limit") {
        return apiError(request, 429, "rate_limited", "Too many verification emails were requested. Wait briefly and retry.");
      }
      if (otpError) throw otpError;
      return apiData(request, {
        sent: true,
        verificationKind: "registration",
        grantId: grant.grant_id,
        expiresAt: grant.expires_at,
        assignmentBasis: grant.assignment_basis,
        outcome: "UNIVERSAL_VERIFICATION_REQUIRED" as const,
        message: "Verify the one-time code to join the selected institution.",
        institution: institution.name,
        domain
      });
    }
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
    const outcomeDetails = (outcome: RegistrationOutcome) => ({ outcome, institution: institution.name, domain });
    if (decision === "INSTITUTION_NOT_SUPPORTED") return apiError(request, 403, "forbidden", registrationOutcomeMessages[decision], outcomeDetails(decision));
    if (decision === "INSTITUTION_DOMAIN_MISMATCH") return apiError(request, 403, "forbidden", registrationOutcomeMessages[decision], outcomeDetails(decision));
    if (decision === "ALUMNI_DOMAIN") return apiError(request, 403, "forbidden", registrationOutcomeMessages[decision], outcomeDetails(decision));
    if (decision === "CAMPUS_REGISTRATION_PAUSED") return apiError(request, 403, "forbidden", registrationOutcomeMessages[decision], outcomeDetails(decision));
    if (decision === "DOMAIN_DISABLED") return apiError(request, 403, "forbidden", registrationOutcomeMessages[decision], outcomeDetails(decision));
    if (decision === "DIRECTORY_LISTED_DOMAIN_REVIEW_REQUIRED" || decision === "AMBIGUOUS_OR_SHARED_DOMAIN") {
      let verification: Awaited<ReturnType<typeof beginInstitutionDomainVerification>>;
      try {
        verification = await beginInstitutionDomainVerification({
          institutionId: institution.id,
          institutionName: institution.name,
          email: input.email,
          domain,
          requesterAddress: request.headers.get("cf-connecting-ip") ?? "local"
        });
      } catch (error) {
        console.error(JSON.stringify({ level: "error", event: "registration_domain_verification_failed", requestId: request.headers.get("x-request-id") ?? "unknown", code: error instanceof Error ? error.message : "unknown" }));
        return apiError(request, 503, "service_unconfigured", registrationOutcomeMessages.GLOBAL_SERVICE_UNAVAILABLE, {
          ...outcomeDetails("GLOBAL_SERVICE_UNAVAILABLE"),
          registrationOutcome: decision,
        });
      }
      return apiData(request, {
        sent: true,
        verificationKind: "domain",
        challengeId: verification.challengeId,
        expiresAt: verification.expiresAt,
        outcome: decision,
        message: registrationOutcomeMessages[decision],
        institution: institution.name,
        domain,
      }, 202);
    }
    const { error } = await admin.auth.signInWithOtp({
      email: input.email,
      options: { shouldCreateUser: true, emailRedirectTo: `${process.env.APP_ORIGIN ?? new URL(request.url).origin}/auth/callback` }
    });
    if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") return apiError(request, 429, "rate_limited", "Too many verification emails were requested. Wait briefly and retry.");
    if (error) {
      console.error(JSON.stringify({ level: "error", event: "registration_otp_failed", requestId: request.headers.get("x-request-id") ?? "unknown", code: error.code ?? "unknown", status: error.status }));
      return apiError(request, 503, "service_unconfigured", registrationOutcomeMessages.GLOBAL_SERVICE_UNAVAILABLE, outcomeDetails("GLOBAL_SERVICE_UNAVAILABLE"));
    }
    return apiData(request, {
      sent: true,
      verificationKind: "registration",
      outcome: "SUPPORTED_AND_OPEN" as const,
      message: registrationOutcomeMessages.SUPPORTED_AND_OPEN,
      institution: institution.name,
      domain,
    });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "registration_start_failed", requestId: request.headers.get("x-request-id") ?? "unknown", code: error instanceof Error ? error.message : "unknown" }));
    return apiError(request, 503, "service_unconfigured", registrationOutcomeMessages.GLOBAL_SERVICE_UNAVAILABLE, { outcome: "GLOBAL_SERVICE_UNAVAILABLE" });
  }
}
