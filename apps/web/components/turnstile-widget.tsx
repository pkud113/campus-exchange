"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  function render() {
    if (!siteKey || !holder.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(holder.current, {
      sitekey: siteKey, callback: onToken,
      "expired-callback": () => onToken(""), "error-callback": () => onToken(""), theme: "auto"
    });
  }
  useEffect(() => () => { if (widget.current) window.turnstile?.remove(widget.current); }, []);
  if (!siteKey) return null;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={render}/><div ref={holder} className="turnstile-widget"/></>;
}
