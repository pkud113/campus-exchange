import { cursorSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, requireVerified } from "@/lib/api";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const parsed = cursorSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(request, 400, "bad_request", "Invalid audit pagination.");
  const beforeId = parsed.data.cursor && /^\d+$/.test(parsed.data.cursor) ? Number(parsed.data.cursor) : null;
  if (parsed.data.cursor && beforeId === null) return apiError(request, 400, "bad_request", "Invalid audit cursor.");
  const { slug } = await params;
  const { data: organization } = await context.supabase.from("organizations").select("id").eq("slug", slug.toLowerCase()).single();
  if (!organization) return apiError(request, 404, "not_found", "Organization not found.");
  const { data, error } = await context.supabase.rpc("organization_audit_history", { target_organization: organization.id, before_id: beforeId, result_limit: parsed.data.limit + 1 });
  if (error) return apiError(request, error.code === "42501" ? 403 : 500, error.code === "42501" ? "forbidden" : "internal_error", "Unable to load organization audit history.");
  const rows = data ?? []; const page = rows.slice(0, parsed.data.limit); const last = page.at(-1);
  return apiData(request, { items: page, nextCursor: rows.length > parsed.data.limit && last ? String(last.id) : null });
}
