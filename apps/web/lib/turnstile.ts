import { apiError } from "@/lib/api";

export async function verifyTurnstile(request: Request, token?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token ?? "");
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const result = await response.json() as { success?: boolean };
    return result.success ? null : apiError(request, 400, "bad_request", "Human verification failed. Please retry.");
  } catch {
    return apiError(request, 503, "service_unconfigured", "Human verification is temporarily unavailable.");
  }
}
