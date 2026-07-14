import { profileInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.from("profiles").select("id,campus_id,handle,display_name,bio,status,verified_at,verified_until,created_at,avatar_media_id,banner_media_id,campuses(name)").eq("id", context.userId).single();
  return error ? apiError(request, 500, "internal_error", "Unable to load your profile.") : apiData(request, data);
}

export async function PATCH(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, profileInputSchema); if (input instanceof NextResponse) return input;
  const { data, error } = await context.supabase.from("profiles").update({ display_name: input.displayName, bio: input.bio }).eq("id", context.userId).select("id,handle,display_name,bio,avatar_media_id,banner_media_id").single();
  return error ? apiError(request, 500, "internal_error", "Unable to update your profile.") : apiData(request, data);
}
