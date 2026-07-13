import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { RegistrationForm } from "./registration-form";

export default async function Register({searchParams}:{searchParams:Promise<{email?:string;sent?:string}>}){const query=await searchParams;return <main className="auth-page"><Link className="back-link" href="/sign-in"><ArrowLeft size={17}/> Sign in</Link><section className="auth-panel"><Brand/><div className="auth-copy"><span className="eyebrow"><ShieldCheck size={14}/> One-time verification</span><h1>Create your account.</h1><p>Verify your MSU email once, then choose a permanent username and password.</p></div><RegistrationForm initialEmail={query.email??""} initiallySent={query.sent==="1"}/></section><aside className="auth-art"><div className="auth-quote"><ShieldCheck/><p>Only enabled university domains can create student accounts.</p></div></aside></main>}
