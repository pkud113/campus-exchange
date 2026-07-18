import { schoolRequestVerifySchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, enforceRateLimit, parseJson, verifyMutationOrigin } from "@/lib/api";
import { completeInstitutionDomainVerification } from "@/lib/institution-verification";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, schoolRequestVerifySchema); if (input instanceof NextResponse) return input;
  const clientAddress = request.headers.get("cf-connecting-ip") ?? "local";
  const limited = await enforceRateLimit(request, "school-request-verify", `${clientAddress}:${input.challengeId}`, 8, 600); if (limited) return limited;
  try {
    const result = await completeInstitutionDomainVerification(input);
    if (result?.outcome !== "verified" || !result.request_id) return apiError(request, 400, "bad_request", "That verification code is invalid or expired.");
    return apiData(request, { verified: true, requestId: result.request_id, status: result.request_status ?? "pending" }, 202);
  } catch {
    return apiError(request, 503, "service_unconfigured", "School-domain verification is temporarily unavailable.");
  }
}
