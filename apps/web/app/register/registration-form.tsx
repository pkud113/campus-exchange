"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { InstitutionCombobox, type InstitutionOption } from "@/components/institution-combobox";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { RegistrationOutcome } from "@campus-exchange/contracts";

export function RegistrationForm({ initialEmail = "", initiallySent = false }: { initialEmail?: string; initiallySent?: boolean }) {
  const [institution, setInstitution] = useState<InstitutionOption | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(initiallySent);
  const [grantId, setGrantId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<RegistrationOutcome | null>(null);
  const normalizedDomain = email.includes("@") ? email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase().replace(/\.$/, "") : "";

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    if (!institution) { setError("Select your college from the directory."); return; }
    if (!turnstileToken) { setError("Complete human verification before continuing."); return; }
    setBusy(true); setError(""); setOutcome(null); setGrantId(null);
    const response = await fetch("/api/v1/auth/register/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ institutionId: institution.id, email, turnstileToken })
    });
    const body = await response.json();
    setBusy(false);
    if (response.ok) {
      setGrantId(body.data?.grantId ?? null);
      setOutcome(body.data?.outcome ?? "UNIVERSAL_VERIFICATION_REQUIRED");
      setSent(true);
    }
    else {
      setError(body.error?.message ?? "Unable to send a verification code.");
      setOutcome(body.error?.details?.outcome ?? null);
      setTurnstileToken("");
      setTurnstileResetKey((value) => value + 1);
    }
  }

  async function verifyRegistration(event: React.FormEvent) {
    event.preventDefault();
    if (!grantId) { setError("Start a new verification request."); return; }
    setBusy(true); setError("");
    const { error: authError } = await createSupabaseBrowserClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (authError) { setError("That code is invalid or expired."); setBusy(false); return; }
    const response = await fetch("/api/v1/auth/reverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantId })
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error?.message ?? "Unable to finish verification."); setBusy(false); return; }
    window.location.assign(body.data.next ?? "/onboarding");
  }

  if (sent) return <form className="auth-form auth-form-stacked" onSubmit={verifyRegistration}>
    <div className="success-box registration-outcome"><CheckCircle2 /><div><strong>Verify your institutional email</strong><p>Enter the one-time code to confirm ownership and join the institution you selected.</p><small>{institution?.name} · {normalizedDomain}</small></div></div>
    <label>Verification code<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label>
    {error && <div className="registration-outcome registration-outcome-error" role="alert"><strong>{outcome === "GLOBAL_SERVICE_UNAVAILABLE" ? "Service problem" : "Registration status"}</strong><p>{error}</p>{institution && normalizedDomain && <dl><div><dt>Institution</dt><dd>{institution.name}</dd></div><div><dt>Email domain</dt><dd>{normalizedDomain}</dd></div></dl>}</div>}
    <button className="button button-primary button-wide" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify email"}</button>
    <button type="button" className="text-button" onClick={() => { setSent(false); setGrantId(null); setCode(""); setError(""); setTurnstileToken(""); setTurnstileResetKey((value) => value + 1); }}>Use a different institution or email</button>
  </form>;

  return <form className="auth-form auth-form-stacked" onSubmit={requestCode}>
    <InstitutionCombobox selected={institution} onSelect={(value) => { setInstitution(value); setError(""); }} required />
    <label>School-issued email<input type="email" autoComplete="email" placeholder="name@university.edu" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required /></label>
    <p className="privacy-note">Any active institution can join with a non-consumer institutional mailbox. Your verified selection becomes permanent after onboarding.</p>
    <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} />
    {error && <div className="registration-outcome registration-outcome-error" role="alert"><strong>{outcome === "GLOBAL_SERVICE_UNAVAILABLE" ? "Service problem" : "Registration status"}</strong><p>{error}</p>{institution && normalizedDomain && <dl><div><dt>Institution</dt><dd>{institution.name}</dd></div><div><dt>Email domain</dt><dd>{normalizedDomain}</dd></div></dl>}{outcome && outcome !== "GLOBAL_SERVICE_UNAVAILABLE" && <small>Currently supported campuses remain available. Use a domain-review path if it is offered; no account has been created and approval is not guaranteed.</small>}</div>}
    <button className="button button-primary button-wide" disabled={busy || !turnstileToken || !institution}>{busy ? <><LoaderCircle className="spin" /> Sending…</> : "Continue with school email"}</button>
  </form>;
}
