export function mutationOriginStatus(request: Request, configuredOrigin?: string): 400 | 403 | null {
  const origin = request.headers.get("origin");
  let expectedOrigin: string;
  try { expectedOrigin = new URL(configuredOrigin ?? request.url).origin; } catch { return 403; }
  if (origin ? origin !== expectedOrigin : request.headers.get("sec-fetch-site") !== "same-origin") return 403;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!(request.method === "DELETE" && !contentType) && contentType !== "application/json") return 400;
  return null;
}

export function trustedRequestId(value: string | null | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function requireBooleanSetting(result: { data: unknown; error?: unknown }, name: string): boolean {
  if (result.error || typeof result.data !== "boolean") throw new Error(`${name}_unavailable`);
  return result.data;
}

export function discussionErrorStatus(code?: string): 400 | 403 | 404 | 409 | 500 {
  if (code === "23505") return 409;
  if (code === "P0002") return 404;
  if (code === "23514") return 400;
  if (code === "42501") return 403;
  return 500;
}
