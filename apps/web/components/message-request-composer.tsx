"use client";

import { MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Context = { type: "listing" | "event"; id: string };

export function MessageRequestComposer({
  profileId,
  username,
  campus,
  context,
  label = "Request conversation",
}: {
  profileId: string;
  username: string;
  campus: string;
  context?: Context;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = opening.trim();
    if (text.length < 10 || text.length > 500) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/v1/conversation-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profileId,
        openingMessage: text,
        idempotencyKey: crypto.randomUUID(),
        ...(context ? { context } : {}),
      }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok) {
      if (result?.data?.conversationId) {
        router.push(`/messages?conversation=${result.data.conversationId}`);
      } else {
        router.push("/messages?view=sent");
      }
      router.refresh();
      return;
    }
    setError(result?.error?.message ?? "This request is unavailable right now.");
    setBusy(false);
  }

  return (
    <>
      <button className="button button-primary" type="button" onClick={() => setOpen(true)}>
        <MessageCircle /> {label}
      </button>
      {open && (
        <div className="composer-modal-layer" role="presentation">
          <button className="mobile-drawer-backdrop" aria-label="Close message request" onClick={() => setOpen(false)} />
          <form className="composer-modal listing-form" role="dialog" aria-modal="true" aria-labelledby="request-title" onSubmit={submit}>
            <header>
              <div><span className="overline">MESSAGE REQUEST</span><h2 id="request-title">Message @{username}</h2></div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X /></button>
            </header>
            <p>{campus}</p>
            <label>
              Opening message
              <textarea
                autoFocus
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
                minLength={10}
                maxLength={500}
                rows={5}
                placeholder="Introduce yourself and explain what you’re reaching out about."
                required
              />
              <small>{opening.trim().length}/500 characters · minimum 10</small>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-actions">
              <button className="button button-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="button button-primary" disabled={busy || opening.trim().length < 10}>{busy ? "Sending…" : "Send request"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
