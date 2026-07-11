import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  let supabase;
  try { supabase=await createSupabaseServerClient(); } catch { redirect("/sign-in?reason=configuration"); }
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/sign-in?next=/exchange");
  const {data:profile}=await supabase.from("profiles").select("status,verified_until").eq("id",user.id).maybeSingle();
  if(!profile||profile.status!=="active"||!profile.verified_until||new Date(profile.verified_until)<=new Date())redirect("/sign-in?reason=verification");
  return <AppShell>{children}</AppShell>
}
