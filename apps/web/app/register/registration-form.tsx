"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { CheckCircle2, LoaderCircle, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { RegistrationOutcome } from "@campus-exchange/contracts";

type Institution = {
  id: string;
  name: string;
  city: string;
  region: string;
  status: "active" | "inactive" | "closed" | "merged" | "renamed" | "duplicate";
  registrationStatus: "open" | "suspended" | "closed";
  availability: "supported" | "verification_required" | "unavailable";
};

function InstitutionSearch({ selected, onSelect }: { selected: Institution | null; onSelect: (institution: Institution | null) => void }) {
  const listId = useId();
  const [query, setQuery] = useState(selected?.name ?? "");
  const [options, setOptions] = useState<Institution[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/v1/institutions?q=${encodeURIComponent(query)}&limit=20`, { signal: controller.signal });
        const body = await response.json();
        if (response.ok) setOptions(body.data ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setOptions([]);
      } finally { setBusy(false); }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query]);

  return <div className="institution-combobox">
    <label htmlFor={`${listId}-input`}>College or university</label>
    <div className="institution-search-input">
      <Search size={17} aria-hidden="true" />
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        placeholder="Search all U.S. institutions"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); onSelect(null); }}
        required
      />
    </div>
    {open && <div className="institution-options" id={listId} role="listbox">
      {busy && <p className="institution-option-note">Searching the IPEDS directory…</p>}
      {!busy && options.length === 0 && <p className="institution-option-note">No matching institution found.</p>}
      {!busy && options.map((institution) => <button
        key={institution.id}
        type="button"
        role="option"
        aria-selected={selected?.id === institution.id}
        className="institution-option"
        onClick={() => { onSelect(institution); setQuery(institution.name); setOpen(false); }}
      >
        <span><strong>{institution.name}</strong><small>{[institution.city, institution.region].filter(Boolean).join(", ")}</small></span>
        <em data-availability={institution.availability}>{institution.availability === "supported" ? "Supported" : institution.availability === "verification_required" ? "Domain review" : institution.status}</em>
      </button>)}
    </div>}
    {selected && <p className="institution-selection-note">Selected from NCES IPEDS. This selection does not grant access; the approved email-domain match is authoritative.</p>}
  </div>;
}

export function RegistrationForm({ initialEmail = "", initiallySent = false }: { initialEmail?: string; initiallySent?: boolean }) {
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(initiallySent);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);
  const [pendingComplete, setPendingComplete] = useState(false);
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
    setBusy(true); setError(""); setOutcome(null); setPendingChallengeId(null); setPendingComplete(false);
    const response = await fetch("/api/v1/auth/register/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ institutionId: institution.id, email, turnstileToken })
    });
    const body = await response.json();
    setBusy(false);
    if (response.ok && body.data?.verificationKind === "domain") {
      setPendingChallengeId(body.data.challengeId);
      setOutcome(body.data.outcome ?? null);
      setCode("");
    } else if (response.ok) { setOutcome(body.data?.outcome ?? "SUPPORTED_AND_OPEN"); setSent(true); }
    else {
      setError(body.error?.message ?? "Unable to send a verification code.");
      setOutcome(body.error?.details?.outcome ?? null);
      setTurnstileToken("");
      setTurnstileResetKey((value) => value + 1);
    }
  }

  async function verifyPendingDomain(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingChallengeId) return;
    setBusy(true); setError("");
    const response = await fetch("/api/v1/school-requests/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: pendingChallengeId, email, code })
    });
    const body = await response.json();
    setBusy(false);
    if (response.ok) { setOutcome(body.data?.outcome ?? "VERIFICATION_REQUEST_PENDING"); setPendingComplete(true); }
    else setError(body.error?.message ?? "That verification code is invalid or expired.");
  }

  async function verifyRegistration(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const { error: authError } = await createSupabaseBrowserClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (authError) { setError("That code is invalid or expired."); setBusy(false); return; }
    const response = await fetch("/api/v1/auth/reverify", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = await response.json();
    if (!response.ok) { setError(body.error?.message ?? "Unable to finish verification."); setBusy(false); return; }
    window.location.assign(body.data.next ?? "/onboarding");
  }

  if (pendingComplete) return <div className="success-box registration-outcome"><CheckCircle2 /><div><strong>School email verified</strong><p>We verified ownership of your school email. Registration will remain pending while the campus-domain mapping is reviewed.</p><small>No account or campus was created. We will not promise approval; return after the mapping is reviewed.</small></div></div>;

  if (pendingChallengeId) return <form className="auth-form auth-form-stacked" onSubmit={verifyPendingDomain}>
    <div className="success-box registration-outcome"><CheckCircle2 /><div><strong>{outcome === "AMBIGUOUS_OR_SHARED_DOMAIN" ? "Shared domain review required" : "Domain review required"}</strong><p>{outcome === "AMBIGUOUS_OR_SHARED_DOMAIN" ? "This email domain cannot currently be assigned safely to one campus. Registration will remain unavailable until the domain mapping is reviewed." : "Your school is in the Campus Exchange directory, but this email domain has not been approved for registration yet."}</p><dl><div><dt>Institution</dt><dd>{institution?.name}</dd></div><div><dt>Email domain</dt><dd>{normalizedDomain}</dd></div></dl><small>Enter the code sent to {email} to verify ownership and submit the existing review request. This does not activate an account.</small></div></div>
    <label>Verification code<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label>
    {error && <div className="registration-outcome registration-outcome-error" role="alert"><strong>{outcome === "GLOBAL_SERVICE_UNAVAILABLE" ? "Service problem" : "Registration status"}</strong><p>{error}</p>{institution && normalizedDomain && <dl><div><dt>Institution</dt><dd>{institution.name}</dd></div><div><dt>Email domain</dt><dd>{normalizedDomain}</dd></div></dl>}{outcome && outcome !== "GLOBAL_SERVICE_UNAVAILABLE" && <small>Currently supported campuses remain available. Use a domain-review path if it is offered; no account has been created and approval is not guaranteed.</small>}</div>}
    <button className="button button-primary button-wide" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and submit for review"}</button>
    <button type="button" className="text-button" onClick={() => { setPendingChallengeId(null); setCode(""); setError(""); setTurnstileToken(""); setTurnstileResetKey((value) => value + 1); }}>Use a different college or email</button>
  </form>;

  if (sent) return <form className="auth-form auth-form-stacked" onSubmit={verifyRegistration}>
    <div className="success-box registration-outcome"><CheckCircle2 /><div><strong>School and domain approved</strong><p>This school and email domain are approved. Continue to verify your school email.</p><small>{institution?.name} · {normalizedDomain}</small></div></div>
    <label>Verification code<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label>
    {error && <div className="registration-outcome registration-outcome-error" role="alert"><strong>{outcome === "GLOBAL_SERVICE_UNAVAILABLE" ? "Service problem" : "Registration status"}</strong><p>{error}</p>{institution && normalizedDomain && <dl><div><dt>Institution</dt><dd>{institution.name}</dd></div><div><dt>Email domain</dt><dd>{normalizedDomain}</dd></div></dl>}{outcome && outcome !== "GLOBAL_SERVICE_UNAVAILABLE" && <small>Other currently supported campuses remain available. You may use the domain-review flow when offered; no account has been created.</small>}</div>}
    <button className="button button-primary button-wide" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify email"}</button>
    <button type="button" className="text-button" onClick={() => { setSent(false); setCode(""); setError(""); }}>Use a different email or resend</button>
  </form>;

  return <form className="auth-form auth-form-stacked" onSubmit={requestCode}>
    <InstitutionSearch selected={institution} onSelect={(value) => { setInstitution(value); setError(""); }} />
    <label>School-issued email<input type="email" autoComplete="email" placeholder="name@university.edu" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required /></label>
    <p className="privacy-note">Reviewed domains register immediately. Other directory colleges verify email ownership first and remain pending until an operator approves the mapping.</p>
    <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} />
    {error && <div className="registration-outcome registration-outcome-error" role="alert"><strong>{outcome === "GLOBAL_SERVICE_UNAVAILABLE" ? "Service problem" : "Registration status"}</strong><p>{error}</p>{institution && normalizedDomain && <dl><div><dt>Institution</dt><dd>{institution.name}</dd></div><div><dt>Email domain</dt><dd>{normalizedDomain}</dd></div></dl>}{outcome && outcome !== "GLOBAL_SERVICE_UNAVAILABLE" && <small>Currently supported campuses remain available. Use a domain-review path if it is offered; no account has been created and approval is not guaranteed.</small>}</div>}
    <button className="button button-primary button-wide" disabled={busy || !turnstileToken || !institution}>{busy ? <><LoaderCircle className="spin" /> Sending…</> : "Continue with school email"}</button>
  </form>;
}
