export async function hmacSha256(value: string, secret = process.env.DOMAIN_VERIFICATION_SECRET): Promise<string> {
  if (!secret || secret.length < 32) throw new Error("domain_verification_unconfigured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sixDigitVerificationCode(): string {
  const upperBound = 4_294_000_000;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while ((values[0] ?? upperBound) >= upperBound);
  return String((values[0] ?? 0) % 1_000_000).padStart(6, "0");
}
