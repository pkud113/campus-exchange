import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export default async function SignIn({searchParams}:{searchParams:Promise<{next?:string}>}){
  const params=await searchParams;
  const next=params.next?.startsWith("/")&&!params.next.startsWith("//")?params.next:"/home";
  let authenticated=false;
  try{const db=await createSupabaseServerClient();const{data:{user}}=await db.auth.getUser();authenticated=Boolean(user)}catch{}
  if(authenticated)redirect(next);
  return <main className="auth-page"><Link className="back-link" href="/"><ArrowLeft size={17}/> Back</Link><section className="auth-panel"><Brand/><div className="auth-copy"><span className="eyebrow"><ShieldCheck size={14}/> Verified campus access</span><h1>Welcome back.</h1><p>Sign in with your MSU email or permanent username and password.</p></div><SignInForm next={next}/><div className="privacy-note">Your email verifies eligibility and is never displayed publicly.</div></section><aside className="auth-art"><div className="auth-quote"><ShieldCheck/><p>Verified membership, private conversations, and campus-scoped access.</p></div></aside></main>;
}
