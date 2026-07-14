"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { TurnstileWidget } from "@/components/turnstile-widget";

export function SignInForm({next="/home"}:{next?:string}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!turnstileToken) { setError("Complete human verification before continuing."); return; }
    setBusy(true);
    setError("");
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password, turnstileToken, next })
    });
    const body = await response.json();
    if (response.ok) window.location.assign(body.data.next ?? "/home");
    else {
      setError(body.error?.message ?? "Unable to sign in.");
      setTurnstileToken("");
      setTurnstileResetKey((value) => value + 1);
      setBusy(false);
    }
  }

  return <form className="auth-form auth-form-stacked" onSubmit={submit}>
    <label>Email or username<input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /></label>
    <label>Password<input type="password" autoComplete="current-password" minLength={12} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary button-wide" disabled={busy || !turnstileToken}>{busy ? <><LoaderCircle className="spin" /> Signing in...</> : <>Sign in <ArrowRight size={18} /></>}</button>
    <div className="auth-links"><Link href="/register">Create or finish an account</Link><Link href="/recover">Forgot password?</Link></div>
  </form>;
}
