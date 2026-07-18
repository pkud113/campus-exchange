import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@campus-exchange/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { discussionErrorStatus, mutationOriginStatus, requireBooleanSetting, trustedRequestId } from "@/lib/api-rules";

export type VerifiedContext = { userId: string; campusId: string; requestId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> };

export function requestId(request: Request): string { return trustedRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID(); }

export function apiError(request: Request, status: number, code: ApiErrorCode, message: string, details?: unknown) {
  const payload = { error: { code, message, requestId: requestId(request), ...(details === undefined ? {} : { details }) } };
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export function apiData<T>(request: Request, data: T, status = 200) {
  return NextResponse.json({ data }, { status, headers: { "cache-control": "private, no-store", "x-request-id": requestId(request) } });
}

export async function requireVerified(request: Request): Promise<VerifiedContext | NextResponse> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return apiError(request, 401, "unauthorized", "Sign in with your school email to continue.");
    const [profileResult, enforcementResult] = await Promise.all([
      supabase.from("profiles").select("campus_id,status,verified_until,account_kind,onboarding_completed_at,password_setup_required,campuses!inner(status)").eq("id", auth.user.id).eq("campuses.status","enabled").single(),
      supabase.rpc("auth_v2_enforced")
    ]);
    const { data, error } = profileResult;
    const authV2Enforced = requireBooleanSetting(enforcementResult, "auth_v2_enforcement");
    if (error || !data) return apiError(request, 403, "forbidden", "Complete student verification before using Campus Exchange.");
    if (!data.onboarding_completed_at || (authV2Enforced === true && data.password_setup_required)) return apiError(request, 403, "forbidden", "Complete account setup before using Campus Exchange.");
    if (data.status !== "active") return apiError(request, 403, "forbidden", "This account is not active.");
    if (data.account_kind !== "staff" && (!data.verified_until || new Date(data.verified_until) <= new Date())) return apiError(request, 403, "forbidden", "Your student verification has expired.");
    return { userId: auth.user.id, campusId: data.campus_id, requestId: requestId(request), supabase };
  } catch (error) {
    if (error instanceof Error && error.message === "service_unconfigured") return apiError(request, 503, "service_unconfigured", "Connect a Supabase project to enable this feature.");
    console.error(JSON.stringify({ level: "error", event: "auth_context_failed", requestId: requestId(request) }));
    return apiError(request, 503, "service_unconfigured", "Account verification is temporarily unavailable.");
  }
}

export async function requireDiscussions(request: Request): Promise<VerifiedContext | NextResponse> {
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.rpc("discussions_enabled");
  if (error || data !== true) return apiError(request, 503, "service_unconfigured", "Discussions are temporarily unavailable.");
  return context;
}

export function discussionMutationError(request: Request, error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return apiError(request, 500, "internal_error", fallback);
  const status = discussionErrorStatus(error.code);
  if (status === 409) return apiError(request, status, "conflict", error.message ?? "That value is already in use.");
  if (status === 404) return apiError(request, status, "not_found", error.message ?? "Discussion content was not found.");
  if (status === 400) return apiError(request, status, "bad_request", error.message ?? fallback);
  if (status === 403) return apiError(request, status, "forbidden", error.message ?? "This discussion action is not allowed.");
  return apiError(request, 500, "internal_error", fallback);
}

export async function requireStaff(request: Request, allowed: string[] = ["moderator", "admin"]) {
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const [{ data }, { data: platformRoles }] = await Promise.all([
    context.supabase.from("role_assignments").select("role").eq("profile_id", context.userId).in("role", allowed),
    context.supabase.from("platform_role_assignments").select("role").eq("profile_id", context.userId),
  ]);
  if (!data?.length && !platformRoles?.length) return apiError(request, 403, "forbidden", "Moderator access is required.");
  const {data:aal}=await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aal?.currentLevel!=="aal2")return apiError(request,403,"forbidden","Multi-factor authentication is required for staff actions.");
  return context;
}

export async function parseJson<T>(request: Request, schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { flatten: () => unknown } } }): Promise<T | NextResponse> {
  let value: unknown;
  try { value = await request.json(); } catch { return apiError(request, 400, "bad_request", "Request body must be valid JSON."); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return apiError(request, 400, "bad_request", "Check the submitted fields.", parsed.error?.flatten());
  return parsed.data as T;
}

export function encodeCursor(createdAt: string, id: string): string { return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url"); }
export function decodeCursor(cursor?: string): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
    return { createdAt, id };
  } catch { return null; }
}

export function verifyMutationOrigin(request: Request): NextResponse | null {
  const status = mutationOriginStatus(request, process.env.APP_ORIGIN);
  if (status === 403) return apiError(request, 403, "forbidden", "Request origin was rejected.");
  if (status === 400) return apiError(request, 400, "bad_request", "Content-Type must be application/json.");
  return null;
}

export async function enforceRateLimit(request: Request, scope: string, subject: string, limit: number, windowSeconds: number): Promise<NextResponse | null> {
  try {
    const input = new TextEncoder().encode(`${scope}:${subject}`);
    const digest = await crypto.subtle.digest("SHA-256", input);
    const key = `${scope}:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const { data, error } = await createSupabaseAdminClient().rpc("consume_rate_limit", { rate_key: key, hit_limit: limit, window_seconds: windowSeconds });
    if (error || data !== true) return apiError(request, 429, "rate_limited", "Too many requests. Wait briefly and retry.");
  } catch {
    console.error(JSON.stringify({ level: "error", event: "rate_limit_unavailable", requestId: requestId(request), scope }));
    return apiError(request, 503, "service_unconfigured", "Request protection is temporarily unavailable. Please retry shortly.");
  }
  return null;
}

export async function enforceRateLimits(request: Request, buckets: Array<{ scope: string; subject: string; limit: number; windowSeconds: number }>): Promise<NextResponse | null> {
  for (const bucket of buckets) {
    const result = await enforceRateLimit(request, bucket.scope, bucket.subject, bucket.limit, bucket.windowSeconds);
    if (result) return result;
  }
  return null;
}
