import { passwordResetStartSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, enforceRateLimit, parseJson, verifyMutationOrigin } from "@/lib/api";
import { resolveLoginEmail } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const input = await parseJson(request, passwordResetStartSchema); if (input instanceof NextResponse) return input;
  const limited = await enforceRateLimit(request, "password-reset", `${request.headers.get("cf-connecting-ip") ?? "local"}:${input.identifier.toLowerCase()}`, 5, 600); if (limited) return limited;
  const challengeError = await verifyTurnstile(request, input.turnstileToken); if (challengeError) return challengeError;
  try {
    const email = await resolveLoginEmail(input.identifier);
    if (email) await createSupabaseAdminClient().auth.resetPasswordForEmail(email, { redirectTo: `${process.env.APP_ORIGIN ?? new URL(request.url).origin}/recover` });
  } catch { /* Always return the same response to prevent account enumeration. */ }
  return apiData(request, { sent: true });
}
