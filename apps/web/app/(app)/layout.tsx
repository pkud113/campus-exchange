import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  let supabase;
  try { supabase=await createSupabaseServerClient(); } catch { redirect("/sign-in?reason=configuration"); }
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){const path=(await headers()).get("x-pathname")??"/home";redirect(`/sign-in?next=${encodeURIComponent(path)}`);}
  const [{data:profile},{data:authV2Enforced}]=await Promise.all([supabase.from("profiles").select("status,verified_until,account_kind,onboarding_completed_at,password_setup_required").eq("id",user.id).maybeSingle(),supabase.rpc("auth_v2_enforced")]);
  if(!profile)redirect("/sign-in?reason=verification");
  if(!profile.onboarding_completed_at||(authV2Enforced===true&&profile.password_setup_required))redirect("/onboarding");
  if(profile.status!=="active"||(profile.account_kind!=="staff"&&(!profile.verified_until||new Date(profile.verified_until)<=new Date())))redirect("/sign-in?reason=verification");
  return <AppShell>{children}</AppShell>
}
