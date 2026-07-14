export function mutationOriginStatus(request: Request, configuredOrigin?: string): 400 | 403 | null {
  const origin = request.headers.get("origin");
  if (origin && configuredOrigin && origin !== configuredOrigin) return 403;
  if (request.method !== "DELETE" && !request.headers.get("content-type")?.includes("application/json")) return 400;
  return null;
}

export function discussionErrorStatus(code?: string): 400 | 403 | 404 | 409 | 500 {
  if (code === "23505") return 409;
  if (code === "P0002") return 404;
  if (code === "23514") return 400;
  if (code === "42501") return 403;
  return 500;
}
