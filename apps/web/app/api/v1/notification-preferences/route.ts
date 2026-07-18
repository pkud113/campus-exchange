import { notificationPreferenceInputSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

const defaults = { emailMessages: true, emailDiscussions: true, quietHoursStart: null, quietHoursEnd: null };

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.from("notification_preferences").select("email_messages,email_discussions,quiet_hours_start,quiet_hours_end").eq("profile_id", context.userId).maybeSingle();
  if (error) return apiError(request, 500, "internal_error", "Unable to load email preferences.");
  return apiData(request, data ? { emailMessages: data.email_messages, emailDiscussions: data.email_discussions, quietHoursStart: data.quiet_hours_start, quietHoursEnd: data.quiet_hours_end } : defaults);
}

export async function PATCH(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, notificationPreferenceInputSchema); if (input instanceof NextResponse) return input;
  const { error } = await context.supabase.from("notification_preferences").upsert({ profile_id: context.userId, email_messages: input.emailMessages, email_discussions: input.emailDiscussions, quiet_hours_start: input.quietHoursStart, quiet_hours_end: input.quietHoursEnd }, { onConflict: "profile_id" });
  return error ? apiError(request, 400, "bad_request", "Unable to save email preferences.") : apiData(request, input);
}
