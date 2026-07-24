"use client";

import type { MessageRequestBoxCounts, MessageRequestBoxItem } from "@campus-exchange/shared-types";
import { Ban, Check, Flag, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";

type View = "incoming" | "sent";
const emptyCounts: MessageRequestBoxCounts = { incoming: 0, sent: 0, pending: 0 };

export function MessageRequestsClient({ initialView }: { initialView: View }) {
  const [view, setView] = useState<View>(initialView);
  const [items, setItems] = useState<MessageRequestBoxItem[]>([]);
  const [counts, setCounts] = useState(emptyCounts);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams({ box: view, limit: "20" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/v1/conversation-requests?${params}`);
    const body = await response.json();
    if (response.ok) {
      const result = body.data ?? { items: [], counts: emptyCounts, nextCursor: null };
      setItems((current) => cursor ? [...current, ...result.items] : result.items);
      setCounts(result.counts);
      setNextCursor(result.nextCursor);
    } else {
      setNotice(body.error?.message ?? "Unable to load message requests.");
    }
    setLoading(false);
  }, [view]);

  useEffect(() => {
    void load();
    window.history.replaceState(null, "", `/messages/requests?view=${view}`);
  }, [load, view]);

  async function respond(id: string, responseValue: "accepted" | "declined") {
    const response = await fetch(`/api/v1/conversation-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response: responseValue })
    });
    const body = await response.json();
    if (response.ok) {
      if (body.data?.conversationId) window.location.assign(`/messages?conversation=${body.data.conversationId}`);
      else await load();
    } else setNotice(body.error?.message ?? "This request is no longer available.");
  }

  async function cancel(id: string) {
    const response = await fetch(`/api/v1/conversation-requests/${id}`, { method: "DELETE" });
    if (response.ok) await load();
    else setNotice("This request can no longer be cancelled.");
  }

  async function block(profileId: string) {
    const response = await fetch(`/api/v1/blocks/${profileId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    if (response.ok) await load();
    else setNotice("Unable to block this member.");
  }

  async function report(id: string) {
    const response = await fetch("/api/v1/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: "conversation_request",
        targetId: id,
        reason: "other",
        details: "Reported from message requests.",
        idempotencyKey: crypto.randomUUID()
      })
    });
    setNotice(response.ok ? "Report submitted for review." : "Unable to submit this report.");
  }

  return <section className="message-requests-surface" aria-busy={loading}>
    <div className="request-tabs" role="tablist" aria-label="Message request views">
      <button role="tab" aria-selected={view === "incoming"} className={view === "incoming" ? "active" : ""} onClick={() => setView("incoming")}>
        Incoming ({counts.incoming})
      </button>
      <button role="tab" aria-selected={view === "sent"} className={view === "sent" ? "active" : ""} onClick={() => setView("sent")}>
        Sent ({counts.sent})
      </button>
      <Link className="button button-ghost button-small" href="/messages">Conversations</Link>
    </div>
    {!loading && !items.length && <EmptyState
      icon={<MessageCircle />}
      title={`No ${view} message requests`}
      description={view === "incoming"
        ? "Requests from verified members will appear here."
        : "Start from a profile, listing, or event to send a contextual request."}
      action={view === "sent" ? <Link className="button button-primary" href="/people">Find people</Link> : undefined}
    />}
    <div className="request-list">
      {items.map((request) => <article key={request.conversationId}>
        <UserAvatar
          name={request.counterpart.displayName ?? request.counterpart.username}
          mediaId={request.counterpart.avatarMediaId}
        />
        <div>
          <Link href={`/u/${request.counterpart.username}`}>
            <strong>{request.counterpart.displayName ?? request.counterpart.username}</strong>
          </Link>
          <span>@{request.counterpart.username} · {request.counterpart.campus.shortName}</span>
          <p className="request-opening">{request.openingMessage}</p>
          {request.context?.href && <Link href={request.context.href}>View {request.context.kind} context</Link>}
          <details>
            <summary>Status: {request.status}</summary>
            <ol>
              {request.history.map((history, index) => <li key={`${history.at}-${index}`}>
                {history.status} · {new Date(history.at).toLocaleString()}
              </li>)}
            </ol>
          </details>
        </div>
        <div className="friend-actions">
          {view === "incoming" && request.status === "pending" && <>
            <button className="button button-primary button-small" onClick={() => respond(request.conversationId, "accepted")}><Check />Accept</button>
            <button className="button button-ghost button-small" onClick={() => respond(request.conversationId, "declined")}><X />Decline</button>
            <button className="button button-ghost button-small" onClick={() => report(request.conversationId)}><Flag />Report</button>
            <button className="button button-ghost button-small" onClick={() => block(request.counterpart.id)}><Ban />Block</button>
          </>}
          {view === "sent" && request.status === "pending" && <button className="button button-ghost button-small" onClick={() => cancel(request.conversationId)}>Cancel</button>}
        </div>
      </article>)}
    </div>
    {nextCursor && <button className="button button-ghost" disabled={loading} onClick={() => load(nextCursor)}>
      {loading ? "Loading…" : "Load more"}
    </button>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
  </section>;
}
