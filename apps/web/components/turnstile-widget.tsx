"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

type TurnstileWidgetProps = {
  onToken: (token: string) => void;
  resetKey?: number;
};

export function TurnstileWidget({ onToken, resetKey = 0 }: TurnstileWidgetProps) {
  const holder = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "expired">("loading");
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  const render = useCallback(() => {
    if (!siteKey || !holder.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(holder.current, {
      sitekey: siteKey,
      callback: (token: string) => { setStatus("ready"); onToken(token); },
      "expired-callback": () => { setStatus("expired"); onToken(""); },
      "error-callback": () => { setStatus("error"); onToken(""); },
      theme: "auto"
    });
  }, [onToken, siteKey]);

  useEffect(() => {
    if (!resetKey || !widget.current || !window.turnstile) return;
    setStatus("loading");
    onToken("");
    window.turnstile.reset(widget.current);
  }, [onToken, resetKey]);

  useEffect(() => () => {
    if (widget.current) window.turnstile?.remove(widget.current);
  }, []);

  if (!siteKey) {
    return <p className="form-error" role="alert">Human verification is unavailable. Please try again later.</p>;
  }

  return <>
    <Script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      onLoad={render}
      onReady={render}
    />
    <div ref={holder} className="turnstile-widget" data-testid="turnstile-widget" />
    {status === "error" && <p className="form-error" role="alert">Human verification could not load. Disable content blocking for this site and retry.</p>}
    {status === "expired" && <p className="form-error" role="alert">Human verification expired. Complete it again before continuing.</p>}
  </>;
}
