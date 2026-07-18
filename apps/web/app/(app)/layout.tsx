import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireBooleanSetting } from "@/lib/api-rules";

export const metadata = { robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  let supabase;
  try { supabase=await createSupabaseServerClient(); } catch { redirect("/sign-in?reason=configuration"); }
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){const path=(await headers()).get("x-pathname")??"/home";redirect(`/sign-in?next=${encodeURIComponent(path)}`);}
  const [profileResult,enforcementResult]=await Promise.all([supabase.from("profiles").select("status,verified_until,account_kind,onboarding_completed_at,password_setup_required").eq("id",user.id).maybeSingle(),supabase.rpc("auth_v2_enforced")]);
  const profile=profileResult.data;
  let authV2Enforced:boolean;
  try{authV2Enforced=requireBooleanSetting(enforcementResult,"auth_v2_enforcement")}catch{redirect("/sign-in?reason=configuration")}
  if(!profile)redirect("/sign-in?reason=verification");
  if(!profile.onboarding_completed_at||(authV2Enforced===true&&profile.password_setup_required))redirect("/onboarding");
  if(profile.status!=="active"||(profile.account_kind!=="staff"&&(!profile.verified_until||new Date(profile.verified_until)<=new Date())))redirect("/sign-in?reason=verification");
  return <AppShell>{children}</AppShell>
}
