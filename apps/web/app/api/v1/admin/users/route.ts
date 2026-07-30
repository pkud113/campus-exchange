import { NextResponse } from "next/server";
import { apiData, apiError, requireStaffCapability } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "users.read");
  if (context instanceof NextResponse) return context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").replace(/[%_,()]/g, "").trim();
  const cursor = url.searchParams.get("cursor");
  let afterCreated: string | null = null;
  let afterId: string | null = null;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
      if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string" || Number.isNaN(Date.parse(decoded.createdAt))) throw new Error("invalid cursor");
      afterCreated = decoded.createdAt;
      afterId = decoded.id;
    } catch {
      return apiError(request, 400, "bad_request", "The user directory cursor is invalid.");
    }
  }
  const { data, error } = await context.supabase.rpc("admin_user_directory", {
    search_term: q,
    after_created: afterCreated,
    after_id: afterId,
    result_limit: 51
  });
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "admin_user_directory_failed", requestId: context.requestId, code: error.code, staffScope: context.staff.scope }));
    return apiError(request, 503, "service_unavailable", "The user directory is temporarily unavailable.");
  }
  const rows = data ?? [];
  const items = rows.slice(0, 50);
  const last = items.at(-1);
  return apiData(request, {
    items,
    nextCursor: rows.length > 50 && last
      ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id }), "utf8").toString("base64url")
      : null
  });
}
