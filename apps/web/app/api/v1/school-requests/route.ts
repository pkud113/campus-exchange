import { schoolRequestSchema } from "@campus-exchange/contracts";
import { normalizeSchoolDomain } from "@campus-exchange/domain";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimit, parseJson, verifyMutationOrigin } from "@/lib/api";
import { beginInstitutionDomainVerification } from "@/lib/institution-verification";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, schoolRequestSchema); if (input instanceof NextResponse) return input;
  const domain = normalizeSchoolDomain(input.email);
  const clientAddress = request.headers.get("cf-connecting-ip") ?? "local";
  const limited = await enforceRateLimit(request, "school-request", `${clientAddress}:${domain}`, 3, 86400); if (limited) return limited;
  const challengeError = await verifyTurnstile(request, input.turnstileToken); if (challengeError) return challengeError;

  try {
    const admin = createSupabaseAdminClient();
    const { data: institution, error: institutionError } = await admin.from("institution_directory")
      .select("id,name,registration_status,campus_id")
      .eq("id", input.institutionId)
      .maybeSingle();
    if (institutionError) throw institutionError;
    if (!institution) return apiError(request, 400, "bad_request", "Select a college from the directory.");
    const { data: resolutions, error: resolutionError } = await admin.rpc("registration_domain_resolution", { input_domain: domain });
    if (resolutionError) throw resolutionError;
    const resolved = resolutions?.[0] as { resolution?: string; campus_id?: string } | undefined;
    const resolution = resolved?.resolution ?? "unsupported";
    if (resolution === "eligible" && resolved?.campus_id === institution.campus_id) return apiError(request, 409, "conflict", "This school is already available. Return to registration and request a code.");
    if (resolution === "eligible") return apiError(request, 403, "forbidden", "That domain is approved for a different college.", { reason: "institution_domain_mismatch" });
    if (resolution === "alumni") return apiError(request, 400, "bad_request", "Alumni email domains cannot be requested for student registration.");
    if (resolution === "campus_disabled" || resolution === "domain_disabled") return apiError(request, 409, "conflict", "This school is already known but is not currently accepting registrations.");
    if (institution.registration_status !== "open") return apiError(request, 403, "forbidden", "This institution is not currently accepting domain-verification requests.");

    const verification = await beginInstitutionDomainVerification({
      institutionId: institution.id,
      institutionName: institution.name,
      email: input.email,
      domain,
      requesterAddress: clientAddress
    });
    return apiData(request, { sent: true, challengeId: verification.challengeId, expiresAt: verification.expiresAt }, 202);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "school_request_failed", requestId: request.headers.get("x-request-id") ?? "unknown" }));
    return apiError(request, 503, "service_unconfigured", "School requests are temporarily unavailable.");
  }
}
