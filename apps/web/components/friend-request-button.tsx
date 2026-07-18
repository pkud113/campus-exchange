"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";

export function FriendRequestButton({ profileId }: { profileId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function send() {
    setState("sending");
    const response = await fetch("/api/v1/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, idempotencyKey: crypto.randomUUID() }) });
    setState(response.ok ? "sent" : "error");
  }
  return <button className="button button-ghost button-small" type="button" onClick={send} disabled={state === "sending" || state === "sent"}><UserPlus />{state === "sent" ? "Requested" : state === "sending" ? "Sending…" : state === "error" ? "Try again" : "Add friend"}</button>;
}
