"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";

export function RegistrationForm({ initialEmail = "", initiallySent = false }: { initialEmail?: string; initiallySent?: boolean }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(initiallySent);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [error, setError] = useState("");

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    if (!turnstileToken) { setError("Complete human verification before continuing."); return; }
    setBusy(true);
    setError("");
    const response = await fetch("/api/v1/auth/register/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, turnstileToken })
    });
    const body = await response.json();
    setBusy(false);
    if (response.ok) setSent(true);
    else {
      setError(body.error?.message ?? "Unable to send a verification code.");
      setTurnstileToken("");
      setTurnstileResetKey((value) => value + 1);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: authError } = await createSupabaseBrowserClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (authError) { setError("That code is invalid or expired."); setBusy(false); return; }
    const response = await fetch("/api/v1/auth/reverify", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = await response.json();
    if (!response.ok) { setError(body.error?.message ?? "Unable to finish verification."); setBusy(false); return; }
    window.location.assign(body.data.next ?? "/onboarding");
  }

  if (sent) return <form className="auth-form auth-form-stacked" onSubmit={verify}>
    <div className="success-box"><CheckCircle2 /><div><strong>Check your inbox</strong><p>Enter the six-digit code sent to {email}.</p></div></div>
    <label>Verification code<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary button-wide" disabled={busy || code.length !== 6}>{busy ? "Verifying..." : "Verify email"}</button>
    <button type="button" className="text-button" onClick={() => { setSent(false); setCode(""); setError(""); }}>Use a different email or resend</button>
  </form>;

  return <form className="auth-form auth-form-stacked" onSubmit={requestCode}>
    <label>MSU email<input type="email" autoComplete="email" placeholder="netid@msu.edu" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary button-wide" disabled={busy || !turnstileToken}>{busy ? <><LoaderCircle className="spin" /> Sending...</> : "Send verification code"}</button>
  </form>;
}
