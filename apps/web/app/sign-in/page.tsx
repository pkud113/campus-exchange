import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { SignInForm } from "./sign-in-form";
export default function SignIn(){return <main className="auth-page"><Link className="back-link" href="/"><ArrowLeft size={17}/> Back</Link><section className="auth-panel"><Brand/><div className="auth-copy"><span className="eyebrow"><ShieldCheck size={14}/> Verified students only</span><h1>Your campus is waiting.</h1><p>Enter your school email. We’ll send you a secure sign-in link—no password to remember.</p></div><SignInForm/><div className="privacy-note">Your email verifies student status. It is never shown on your public profile.</div></section><aside className="auth-art"><div className="auth-quote"><span>“</span><p>Found a desk, a study group, and Friday plans in the same afternoon.</p><small>— a very productive sophomore</small></div></aside></main>}
