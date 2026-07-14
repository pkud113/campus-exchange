import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/register?reason=invalid_link", url.origin));

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/register?reason=invalid_link", url.origin));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/register?reason=invalid_link", url.origin));
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at,password_setup_required")
      .eq("id", user.id)
      .maybeSingle();
    const next = !profile?.onboarding_completed_at || profile.password_setup_required ? "/onboarding" : "/home";
    return NextResponse.redirect(new URL(next, url.origin));
  } catch {
    return NextResponse.redirect(new URL("/register?reason=invalid_link", url.origin));
  }
}
