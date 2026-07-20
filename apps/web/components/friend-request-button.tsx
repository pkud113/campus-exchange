"use client";

import { useState } from "react";
import { Check, Clock3, UserMinus, UserPlus, X } from "lucide-react";

type Relationship = "none" | "pending" | "accepted" | "declined" | "cancelled" | "removed" | "blocked" | "self";

export function FriendRequestButton({ profileId, initialStatus = "none", requestedBy = null, viewerId = null, disabledReason }: { profileId: string; initialStatus?: Relationship; requestedBy?: string | null; viewerId?: string | null; disabledReason?: string }) {
  const [status, setStatus] = useState<Relationship>(initialStatus);
  const [requester, setRequester] = useState<string | null>(requestedBy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "send" | "accept" | "decline" | "cancel" | "remove") {
    setBusy(true); setError("");
    const response = await fetch(action === "send" ? "/api/v1/friends" : `/api/v1/friends/${profileId}`, {
      method: action === "send" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action === "send" ? { profileId, idempotencyKey: crypto.randomUUID() } : { action, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      const next = body.data?.status ?? (action === "send" ? "pending" : action === "accept" ? "accepted" : action === "decline" ? "declined" : action === "cancel" ? "cancelled" : "removed");
      setStatus(next); if (action === "send") setRequester(viewerId);
    } else setError(body?.error?.message ?? "Friend action unavailable.");
    setBusy(false);
  }

  if (status === "self") return null;
  if (status === "blocked" || disabledReason) return <span className="relationship-unavailable">{disabledReason ?? "Cannot interact"}</span>;
  const incoming = status === "pending" && Boolean(viewerId) && requester !== viewerId;
  return <div className="relationship-actions" aria-live="polite">
    {status === "accepted" ? <><span className="button button-ghost button-small relationship-state"><Check /> Friends</span><button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => act("remove")}><UserMinus /> Remove</button></>
      : incoming ? <><button className="button button-primary button-small" type="button" disabled={busy} onClick={() => act("accept")}><Check /> Accept</button><button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => act("decline")}><X /> Decline</button></>
      : status === "pending" ? <><span className="button button-ghost button-small relationship-state"><Clock3 /> Request sent</span><button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => act("cancel")}>Cancel</button></>
      : <button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => act("send")}><UserPlus />{busy ? "Sending…" : "Add friend"}</button>}
    {error && <small className="form-error">{error}</small>}
  </div>;
}
