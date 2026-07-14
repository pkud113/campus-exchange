import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_ORIGIN: string;
  MEDIA_BUCKET: { delete: (key: string) => Promise<void> };
};

type OutboxEvent = {
  id: string;
  campus_id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, string>;
  attempt_count: number;
};

export async function deterministicNotificationId(eventId: string, recipientId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${eventId}:${recipientId}`)));
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function retryDelaySeconds(attemptCount:number){return Math.min(3600,2**attemptCount*15)}

const discussionEventTypes = new Set([
  "discussion.post_replied", "discussion.comment_replied", "discussion.add_moderator",
  "discussion.remove_moderator", "discussion.ban_member", "discussion.unban_member",
  "discussion.remove_post", "discussion.remove_comment", "discussion.remove_community", "discussion.ownership_transferred"
]);

export function discussionNotificationCopy(eventType: string, communitySlug: string, postId?: string) {
  const href = postId ? `/discussions/c/${communitySlug}/posts/${postId}` : `/discussions/c/${communitySlug}`;
  const copy: Record<string, { title: string; body: string }> = {
    "discussion.post_replied": { title: "New reply to your post", body: "A campus member replied to your discussion post." },
    "discussion.comment_replied": { title: "New reply to your comment", body: "A campus member replied in a discussion." },
    "discussion.add_moderator": { title: "You are now a community moderator", body: "A community owner appointed you as a moderator." },
    "discussion.remove_moderator": { title: "Community role updated", body: "Your community moderator role was removed." },
    "discussion.ban_member": { title: "Community membership restricted", body: "A community moderator restricted your membership." },
    "discussion.unban_member": { title: "Community restriction removed", body: "A community moderator removed your membership restriction." },
    "discussion.remove_post": { title: "Discussion post removed", body: "A community moderator removed one of your posts." },
    "discussion.remove_comment": { title: "Discussion comment removed", body: "A community moderator removed one of your comments." },
    "discussion.remove_community": { title: "Community restricted", body: "Campus staff restricted one of your communities." },
    "discussion.ownership_transferred": { title: "Community ownership transferred", body: "You are now the owner of a campus community." }
  };
  return { ...(copy[eventType] ?? { title: "Campus discussion update", body: "There is an update in one of your campus communities." }), href };
}

export function shouldSuppressDiscussionNotification(payload: Record<string, string>) {
  return Boolean(payload.actorId && payload.actorId === payload.recipientId);
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

async function deliverDiscussionEvent(db: SupabaseClient, event: OutboxEvent, env: Env) {
  const recipientId = event.payload.recipientId;
  const communityId = event.payload.communityId;
  if (!recipientId || !communityId) throw new Error("invalid discussion event payload");
  if (shouldSuppressDiscussionNotification(event.payload)) return;
  let communitySlug = event.payload.communitySlug;
  if (!communitySlug) {
    const { data, error } = await db.from("discussion_communities").select("slug").eq("id", communityId).maybeSingle();
    if (error || !data?.slug) throw error ?? new Error("discussion community unavailable");
    communitySlug = data.slug as string;
  }
  const copy = discussionNotificationCopy(event.event_type, communitySlug, event.payload.postId);
  const notificationId = await deterministicNotificationId(event.id, recipientId);
  const { error: notificationError } = await db.from("notifications").upsert({
    id: notificationId,
    campus_id: event.campus_id,
    profile_id: recipientId,
    source_event_id: event.id,
    kind: "discussion",
    title: copy.title,
    body: copy.body,
    href: copy.href
  }, { onConflict: "profile_id,source_event_id" });
  if (notificationError) throw notificationError;
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const { data: userData } = await db.auth.admin.getUserById(recipientId);
    if (userData.user?.email) {
      const resend = new Resend(env.RESEND_API_KEY);
      const delivery = await resend.emails.send({
        from: env.EMAIL_FROM,
        to: userData.user.email,
        subject: "Campus Exchange discussion update",
        html: `<p>You have a new campus discussion update.</p><p><a href="${env.APP_ORIGIN}${copy.href}">Open Campus Exchange</a></p>`
      }, { idempotencyKey: `discussion-${event.id}-${recipientId}` });
      if (delivery.error) throw new Error(`Resend delivery failed: ${delivery.error.name}`);
    }
  }
}

async function processEvent(db: SupabaseClient, event: OutboxEvent, env: Env) {
  if (event.event_type === "message.created") return deliverMessageCreated(db, event, env);
  if (discussionEventTypes.has(event.event_type)) return deliverDiscussionEvent(db, event, env);
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
      const delaySeconds = retryDelaySeconds(event.attempt_count);
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

async function runMaintenance(env: Env) {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const { data: media, error: mediaError } = await db.from("media_uploads").select("id,object_key").lte("purge_after", now).limit(100);
  if (mediaError) throw mediaError;
  for (const item of media ?? []) {
    await env.MEDIA_BUCKET.delete(item.object_key);
    const { error } = await db.from("media_uploads").delete().eq("id", item.id);
    if (error) throw error;
  }
  const { error: listingError } = await db.from("listings").delete().lte("purge_after", now);
  if (listingError) throw listingError;
  const { error: eventError } = await db.from("events").delete().lte("purge_after", now);
  if (eventError) throw eventError;
  const { error: postPurgeError } = await db.from("discussion_posts").update({
    author_id: null, title: "[deleted]", body: null, link_url: null, media_id: null,
    removal_reason: null, deleted_by: null, locked_by: null, removed_by: null, purged_at: now
  }).lte("purge_after", now).is("purged_at", null);
  if (postPurgeError) throw postPurgeError;
  const { error: commentPurgeError } = await db.from("discussion_comments").update({
    author_id: null, body: null, removal_reason: null, deleted_by: null, removed_by: null, purged_at: now
  }).lte("purge_after", now).is("purged_at", null);
  if (commentPurgeError) throw commentPurgeError;
  const { error: communityPurgeError } = await db.from("discussion_communities").update({
    description: "", rules: "", icon_media_id: null, banner_media_id: null, deleted_by: null, purged_at: now
  }).lte("purge_after", now).is("purged_at", null);
  if (communityPurgeError) throw communityPurgeError;
  const abandonedMediaCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: discussionMedia, error: discussionMediaError } = await db.from("media_uploads").select("id,object_key").in("purpose", ["community_icon", "community_banner", "discussion_post"]).eq("status", "ready").is("attached_at", null).lt("created_at", abandonedMediaCutoff).limit(100);
  if (discussionMediaError) throw discussionMediaError;
  for (const item of discussionMedia ?? []) {
    await env.MEDIA_BUCKET.delete(item.object_key);
    const { error } = await db.from("media_uploads").delete().eq("id", item.id).is("attached_at", null);
    if (error) throw error;
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: abandoned, error: abandonedError } = await db.from("profiles").select("id").eq("status", "pending").is("onboarding_completed_at", null).lt("created_at", cutoff).limit(50);
  if (abandonedError) throw abandonedError;
  for (const profile of abandoned ?? []) {
    const { error } = await db.auth.admin.deleteUser(profile.id);
    if (error) throw error;
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(Promise.all([runBatch(env), runMaintenance(env)])); },
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname !== "/health") return new Response("Not found", { status: 404 });
    return Response.json({ status: "ok", service: "campus-exchange-worker" });
  }
} satisfies ExportedHandler<Env>;
