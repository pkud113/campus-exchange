"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback": () => void;
        "error-callback": () => void;
        theme: string;
      }) => string;
      reset: (id?: string) => void;
    };
  }
}

type State = "idle" | "sending" | "sent" | "verifying" | "error";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const holder = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  function renderWidget() {
    if (siteKey && holder.current && window.turnstile && !widget.current) {
      widget.current = window.turnstile.render(holder.current, {
        sitekey: siteKey,
        callback: setTurnstileToken,
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
        theme: "light"
      });
    }
  }

  useEffect(renderWidget, [siteKey]);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    if (siteKey && !turnstileToken) {
      setMessage("Complete the security check first.");
      setState("error");
      return;
    }
    setMessage("");
    setState("sending");
    const response = await fetch("/api/v1/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, turnstileToken: turnstileToken || undefined })
    });
    const body = await response.json();
    if (response.ok) {
      setState("sent");
      return;
    }
    setMessage(body.error?.message ?? "Something went wrong.");
    setState("error");
    setTurnstileToken("");
    window.turnstile?.reset(widget.current);
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) return;
    setMessage("");
    setState("verifying");
    const { error } = await createSupabaseBrowserClient().auth.verifyOtp({ email, token: otp, type: "email" });
    if (error) {
      setMessage("That code is invalid or expired. Request a new code and try again.");
      setState("sent");
      return;
    }
    window.location.assign("/exchange");
  }

  function startOver() {
    setOtp("");
    setMessage("");
    setState("idle");
    setTurnstileToken("");
    window.turnstile?.reset(widget.current);
  }

  if (state === "sent" || state === "verifying") {
    return <div className="otp-panel">
      <div className="success-box"><CheckCircle2 /><div><strong>Check your MSU inbox</strong><p>Enter the six-digit code sent to {email}.</p></div></div>
      <form className="otp-form" onSubmit={verifyCode}>
        <label htmlFor="email-code">Verification code</label>
        <input id="email-code" className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus required />
        <button className="button button-primary" disabled={state === "verifying" || otp.length !== 6}>{state === "verifying" ? "Verifying…" : "Verify and continue"}</button>
        {message && <p className="form-error" role="alert">{message}</p>}
        <button className="text-button" type="button" onClick={startOver}>Use a different email or request a new code</button>
      </form>
    </div>;
  }

  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={renderWidget} />
    <form className="auth-form" onSubmit={requestCode}>
      <label htmlFor="school-email">MSU email</label>
      <div className="email-field">
        <input id="school-email" type="email" autoComplete="email" placeholder="netid@msu.edu" value={email} onChange={(event) => setEmail(event.target.value)} pattern="^[^@]+@msu\.edu$" required />
        <button className="button button-primary" disabled={state === "sending" || (Boolean(siteKey) && !turnstileToken)}>{state === "sending" ? "Sending…" : <>Send code <ArrowRight size={18} /></>}</button>
      </div>
      {siteKey && <div ref={holder} className="turnstile-widget" />}
      {state === "error" && <p className="form-error" role="alert">{message}</p>}
      <small>By continuing, you agree to the community guidelines and safe trading rules.</small>
    </form>
  </>;
}
