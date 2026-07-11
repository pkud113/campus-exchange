import { apiData, apiError } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient(); const { data } = await supabase.auth.getUser();
    if (!data.user) return apiData(request, { authenticated: false });
    const { data: profile } = await supabase.from("profiles").select("id,campus_id,handle,display_name,bio,status,verified_until").eq("id", data.user.id).maybeSingle();
    const { data: roles } = await supabase.from("role_assignments").select("role").eq("profile_id", data.user.id);
    return apiData(request, { authenticated: true, email: data.user.email, profile, roles: roles?.map((r) => r.role) ?? [] });
  } catch { return apiError(request, 503, "service_unconfigured", "Connect Supabase to enable sessions."); }
}
