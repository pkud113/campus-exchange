"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LoaderCircle, MessageCircle, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Participant = {
  profile_id: string;
  profiles?: { handle?: string; display_name?: string } | Array<{ handle?: string; display_name?: string }>;
};
type Conversation = {
  id: string;
  listing_id: string | null;
  last_message_at: string;
  listings?: { title?: string } | Array<{ title?: string }>;
  conversation_participants?: Participant[];
};
type Message = { id: string; sender_id: string; body: string; created_at: string };

export function MessagesClient() {
  const requestedConversation = useSearchParams().get("conversation");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUser, setCurrentUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    client.auth.getUser().then(({ data }) => setCurrentUser(data.user?.id ?? ""));
    fetch("/api/v1/conversations")
      .then((response) => response.json())
      .then((result) => {
        const loaded = (result.data ?? []) as Conversation[];
        setConversations(loaded);
        setSelected(loaded.some((item) => item.id === requestedConversation) ? requestedConversation! : loaded[0]?.id ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("Unable to load conversations.");
        setLoading(false);
      });
  }, [requestedConversation]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    async function load() {
      const response = await fetch(`/api/v1/conversations/${selected}/messages?limit=50`);
      const result = await response.json();
      if (active) setMessages((result.data ?? []).reverse());
    }
    void load();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`conversation:${selected}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selected}` }, () => void load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [selected]);

  const activeConversation = useMemo(() => conversations.find((conversation) => conversation.id === selected), [conversations, selected]);
  function relationName(value: Conversation["listings"]) {
    const row = Array.isArray(value) ? value[0] : value;
    return row?.title ?? "Marketplace conversation";
  }
  function participantName(conversation: Conversation) {
    const other = conversation.conversation_participants?.find((participant) => participant.profile_id !== currentUser);
    const profile = Array.isArray(other?.profiles) ? other.profiles[0] : other?.profiles;
    return profile?.display_name ?? profile?.handle ?? "Verified student";
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() || !selected) return;
    const draft = body;
    setBody("");
    setError("");
    const response = await fetch(`/api/v1/conversations/${selected}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: draft, idempotencyKey: crypto.randomUUID() })
    });
    const result = await response.json();
    if (response.ok) setMessages((existing) => existing.some((message) => message.id === result.data.id) ? existing : [...existing, result.data]);
    else {
      setBody(draft);
      setError(result.error?.message ?? "Unable to send message.");
    }
  }

  if (loading) return <main className="center-state"><LoaderCircle className="spin" /> Loading conversations…</main>;
  return <main className="messages-page">
    <section className="conversation-list">
      <div className="messages-head"><span className="overline">PRIVATE &amp; VERIFIED</span><h1>Messages</h1><label><Search /><input placeholder="Search conversations" aria-label="Search conversations" /></label></div>
      {!conversations.length && <div className="empty-state"><MessageCircle /><h2>No conversations yet</h2><p>Open a listing and message its seller to start one.</p></div>}
      {conversations.map((conversation) => <button key={conversation.id} className={`conversation-row ${conversation.id === selected ? "selected" : ""}`} onClick={() => setSelected(conversation.id)}><span className="avatar coral">{participantName(conversation)[0]?.toUpperCase()}</span><div><span><strong>{participantName(conversation)}</strong><small>{new Date(conversation.last_message_at).toLocaleDateString()}</small></span><em>{relationName(conversation.listings)}</em></div></button>)}
    </section>
    <section className="thread">
      {activeConversation ? <><header><span className="avatar coral">{participantName(activeConversation)[0]?.toUpperCase()}</span><div><strong>{participantName(activeConversation)}</strong><small>{relationName(activeConversation.listings)} · Verified student</small></div></header><div className="trade-banner"><MessageCircle /><div><strong>Keep the conversation here</strong><span>Never share verification codes or send a deposit to hold an item.</span></div></div><div className="message-stream">{messages.map((message) => <div key={message.id} className={`bubble ${message.sender_id === currentUser ? "mine" : "theirs"}`}>{message.body}<small>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div>)}</div><form className="message-composer" onSubmit={send}><input aria-label="Write a message" placeholder="Write a message…" value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} /><button className="button button-primary" disabled={!body.trim()}>Send</button></form></> : <div className="empty-state"><MessageCircle /><h2>Select a conversation</h2></div>}
      {error && <p className="form-error message-error" role="alert">{error}</p>}
    </section>
  </main>;
}
