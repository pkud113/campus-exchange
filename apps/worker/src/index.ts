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
    await db.from("notifications").upsert({
      id: crypto.randomUUID(), campus_id: event.campus_id, profile_id: recipientId,
      kind: "message", title: "New marketplace message", body: "A student sent you a message.", href: `/messages/${conversationId}`
    }, { onConflict: "id" });
    // Email is intentionally generic: private message text never enters logs or email payloads.
    if (env.RESEND_API_KEY && env.EMAIL_FROM) {
      const { data: userData } = await db.auth.admin.getUserById(recipientId);
      if (userData.user?.email) {
        const resend = new Resend(env.RESEND_API_KEY);
        await resend.emails.send({ from: env.EMAIL_FROM, to: userData.user.email, subject: "New message on Campus Exchange", html: `<p>You have a new marketplace message.</p><p><a href="${env.APP_ORIGIN}/messages/${conversationId}">Open Campus Exchange</a></p>` });
      }
    }
  }
}

async function processEvent(db: SupabaseClient, event: OutboxEvent, env: Env) {
  if (event.event_type === "message.created") await deliverMessageCreated(db, event, env);
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
