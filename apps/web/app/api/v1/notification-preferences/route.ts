import { notificationCategorySchema, notificationPreferenceInputSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

const defaults = { emailMessages: true, emailDiscussions: true, quietHoursStart: null, quietHoursEnd: null };

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const [{ data, error }, { data: categoryRows, error: categoryError }] = await Promise.all([
    context.supabase.from("notification_preferences").select("email_messages,email_discussions,quiet_hours_start,quiet_hours_end").eq("profile_id", context.userId).maybeSingle(),
    context.supabase.from("notification_category_preferences").select("category,in_app,email").eq("profile_id", context.userId)
  ]);
  if (error || categoryError) return apiError(request, 500, "internal_error", "Unable to load notification preferences.");
  const legacy = data ? { emailMessages: data.email_messages, emailDiscussions: data.email_discussions, quietHoursStart: data.quiet_hours_start, quietHoursEnd: data.quiet_hours_end } : defaults;
  const byCategory = new Map((categoryRows ?? []).map((row) => [row.category, row]));
  const categories = Object.fromEntries(notificationCategorySchema.options.map((category) => {
    const row = byCategory.get(category);
    const legacyEmail = category === "message" || category === "message_request"
      ? legacy.emailMessages
      : category === "discussion_activity" ? legacy.emailDiscussions : false;
    return [category, {
      inApp: category === "moderation_activity" || category === "security_activity" ? true : row?.in_app ?? true,
      email: row?.email ?? legacyEmail,
      mandatoryInApp: category === "moderation_activity" || category === "security_activity"
    }];
  }));
  return apiData(request, { ...legacy, categories });
}

export async function PATCH(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, notificationPreferenceInputSchema); if (input instanceof NextResponse) return input;
  const { data: current } = await context.supabase.from("notification_preferences")
    .select("email_messages,email_discussions")
    .eq("profile_id", context.userId)
    .maybeSingle();
  const legacy = {
    profile_id: context.userId,
    email_messages: input.emailMessages ?? current?.email_messages ?? true,
    email_discussions: input.emailDiscussions ?? current?.email_discussions ?? true,
    quiet_hours_start: input.quietHoursStart,
    quiet_hours_end: input.quietHoursEnd
  };
  const { error } = await context.supabase.from("notification_preferences").upsert(legacy, { onConflict: "profile_id" });
  if (error) return apiError(request, 400, "bad_request", "Unable to save notification preferences.");
  if (input.categories) {
    const categoryRows = Object.entries(input.categories).map(([category, preference]) => ({
      profile_id: context.userId,
      category,
      in_app: category === "moderation_activity" || category === "security_activity" ? true : preference.inApp,
      email: preference.email
    }));
    const { error: categoriesError } = await context.supabase
      .from("notification_category_preferences")
      .upsert(categoryRows, { onConflict: "profile_id,category" });
    if (categoriesError) return apiError(request, 400, "bad_request", "Unable to save category preferences.");
  }
  return apiData(request, input);
}
