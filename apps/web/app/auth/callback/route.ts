import { NextResponse } from "next/server";
import { completePendingRegistrationEnrollment } from "@/lib/enrollment-completion";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appOrigin = process.env.APP_ORIGIN ?? url.origin;
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/register?reason=invalid_link", appOrigin));

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/register?reason=invalid_link", appOrigin));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/register?reason=invalid_link", appOrigin));
    let { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at,password_setup_required")
      .eq("id", user.id)
      .maybeSingle();
    const enrollment = await completePendingRegistrationEnrollment(
      (grantId) => supabase.rpc("complete_registration_enrollment", {
        enrollment_grant_id: grantId,
      }),
      user.user_metadata,
      Boolean(profile)
    );
    if (enrollment.attempted && !enrollment.completed) {
      return NextResponse.redirect(new URL("/register?reason=enrollment_failed", appOrigin));
    }
    if (enrollment.attempted) {
      const refreshed = await supabase
        .from("profiles")
        .select("onboarding_completed_at,password_setup_required")
        .eq("id", user.id)
        .maybeSingle();
      profile = refreshed.data;
      if (!profile) {
        return NextResponse.redirect(new URL("/register?reason=enrollment_failed", appOrigin));
      }
    }
    const next = !profile?.onboarding_completed_at || profile.password_setup_required ? "/onboarding" : "/home";
    return NextResponse.redirect(new URL(next, appOrigin));
  } catch {
    return NextResponse.redirect(new URL("/register?reason=invalid_link", appOrigin));
  }
}
