import { apiError } from "@/lib/api";

export async function verifyTurnstile(request: Request, token?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  if (!token) return apiError(request, 400, "bad_request", "Complete human verification before continuing.");
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const result = await response.json() as {
      success?: boolean;
      hostname?: string;
      action?: string;
      "error-codes"?: string[];
    };
    if (result.success) return null;
    console.warn(JSON.stringify({
      level: "warn",
      event: "turnstile_verification_failed",
      requestId: request.headers.get("x-request-id") ?? "unknown",
      errorCodes: result["error-codes"] ?? [],
      hostname: result.hostname ?? null,
      action: result.action ?? null
    }));
    return apiError(request, 400, "bad_request", "Human verification failed. Please complete it again.");
  } catch {
    return apiError(request, 503, "service_unconfigured", "Human verification is temporarily unavailable.");
  }
}
