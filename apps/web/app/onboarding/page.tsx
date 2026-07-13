import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
export const dynamic="force-dynamic";

export default async function Onboarding(){const supabase=await createSupabaseServerClient();const{data:auth}=await supabase.auth.getUser();if(!auth.user)redirect("/register");const{data:profile}=await supabase.from("profiles").select("handle,onboarding_completed_at,password_setup_required").eq("id",auth.user.id).maybeSingle();if(profile?.onboarding_completed_at&&!profile.password_setup_required)redirect("/home");return <main className="auth-page auth-page-single"><section className="auth-panel"><Brand/><div className="auth-copy"><h1>Finish account setup.</h1><p>Choose the credentials you will use for future sign-ins.</p></div><OnboardingForm existingUsername={profile?.handle??""}/></section></main>}
