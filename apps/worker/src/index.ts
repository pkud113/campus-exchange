import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_ORIGIN: string;
};

type OutboxEvent = {
  id: string;
  campus_id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, string>;
  attempt_count: number;
};

async function deterministicNotificationId(eventId: string, recipientId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${eventId}:${recipientId}`)));
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function deliverMessageCreated(db: SupabaseClient, event: OutboxEvent, env: Env) {
  const conversationId = event.payload.conversationId;
  const senderId = event.payload.senderId;
  if (!conversationId || !senderId) throw new Error("invalid message event payload");
  const { data: participants, error } = await db.from("conversation_participants").select("profile_id").eq("conversation_id", conversationId).neq("profile_id", senderId);
  if (error) throw error;
  for (const participant of participants ?? []) {
    const recipientId = participant.profile_id as string;
    const { data: blocked } = await db.from("blocks").select("blocker_id").or(`and(blocker_id.eq.${recipientId},blocked_id.eq.${senderId}),and(blocker_id.eq.${senderId},blocked_id.eq.${recipientId})`).maybeSingle();
    if (blocked) continue;
    const notificationId = await deterministicNotificationId(event.id, recipientId);
    const { error: notificationError } = await db.from("notifications").upsert({
      id: notificationId, campus_id: event.campus_id, profile_id: recipientId, source_event_id: event.id,
      kind: "message", title: "New marketplace message", body: "A student sent you a message.", href: `/messages?conversation=${conversationId}`
    }, { onConflict: "profile_id,source_event_id" });
    if (notificationError) throw notificationError;
    // Email is intentionally generic: private message text never enters logs or email payloads.
    if (env.RESEND_API_KEY && env.EMAIL_FROM) {
      const { data: userData } = await db.auth.admin.getUserById(recipientId);
      if (userData.user?.email) {
        const resend = new Resend(env.RESEND_API_KEY);
        const delivery = await resend.emails.send(
          { from: env.EMAIL_FROM, to: userData.user.email, subject: "New message on Campus Exchange", html: `<p>You have a new marketplace message.</p><p><a href="${env.APP_ORIGIN}/messages?conversation=${conversationId}">Open Campus Exchange</a></p>` },
          { idempotencyKey: `message-${event.id}-${recipientId}` }
        );
        if (delivery.error) throw new Error(`Resend delivery failed: ${delivery.error.name}`);
      }
    }
  }
}

async function processEvent(db: SupabaseClient, event: OutboxEvent, env: Env) {
  if (event.event_type === "message.created") return deliverMessageCreated(db, event, env);
  throw new Error(`unsupported outbox event: ${event.event_type}`);
}

async function runBatch(env: Env): Promise<number> {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("claim_outbox", { batch_size: 25 });
  if (error) throw error;
  let processed = 0;
  for (const event of (data ?? []) as OutboxEvent[]) {
    try {
      await processEvent(db, event, env);
      await db.from("outbox_events").update({ status: "delivered", processed_at: new Date().toISOString(), last_error: null }).eq("id", event.id);
      processed++;
    } catch (error) {
      const dead = event.attempt_count >= 8;
      const delaySeconds = Math.min(3600, 2 ** event.attempt_count * 15);
      await db.from("outbox_events").update({
        status: dead ? "dead_letter" : "pending",
        available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        last_error: error instanceof Error ? error.message.slice(0, 500) : "unknown delivery error",
        locked_at: null
      }).eq("id", event.id);
      console.error(JSON.stringify({ level: "error", event: "outbox_delivery_failed", outboxId: event.id, attempt: event.attempt_count, dead }));
    }
  }
  return processed;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(runBatch(env)); },
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname !== "/health") return new Response("Not found", { status: 404 });
    return Response.json({ status: "ok", service: "campus-exchange-worker" });
  }
} satisfies ExportedHandler<Env>;
