import { z } from "zod";
import { NextResponse } from "next/server";
import { apiData, apiError, parseJson, requireStaffCapability, verifyMutationOrigin } from "@/lib/api";

const schema = z.object({
  section: z.enum(["institutions","users","staff","cases","appeals","social","discussions","organizations","marketplace","events","audit","settings"]),
  name: z.string().trim().min(2).max(80),
  filters: z.record(z.string(), z.unknown())
}).strict();

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "cases.read");
  if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.from("admin_saved_views").select("id,section,name,filters,updated_at").order("updated_at", { ascending: false });
  return error ? apiError(request, 403, "forbidden", "Unable to load saved views.") : apiData(request, data ?? []);
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireStaffCapability(request, "cases.read");
  if (context instanceof NextResponse) return context;
  const input = await parseJson(request, schema);
  if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.from("admin_saved_views").upsert({
    owner_profile_id: context.userId,
    campus_id: context.staff.scope === "campus" ? context.staff.campusId : null,
    section: input.section,
    name: input.name,
    filters: input.filters,
    updated_at: new Date().toISOString()
  }, { onConflict: "owner_profile_id,section,name" }).select("id,section,name,filters,updated_at").single();
  return error ? apiError(request, 403, "forbidden", "Unable to save this queue view.") : apiData(request, data, 201);
}
