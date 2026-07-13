import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { RecoveryForm } from "./recovery-form";

export default function Recover(){return <main className="auth-page auth-page-single"><section className="auth-panel"><Link className="back-link" href="/sign-in"><ArrowLeft size={17}/> Sign in</Link><Brand/><div className="auth-copy"><h1>Reset your password.</h1><p>Use your email or username. Recovery codes do not contain scanner-sensitive links.</p></div><RecoveryForm/></section></main>}
