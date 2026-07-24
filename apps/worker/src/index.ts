import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_ORIGIN: string;
  MEDIA_BUCKET: { delete: (key: string) => Promise<void>; head: (key: string) => Promise<unknown> };
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

export function deliveryErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message.slice(0, 500);
  return "unknown delivery error";
}

const discussionEventTypes = new Set([
  "discussion.post_replied", "discussion.comment_replied", "discussion.add_moderator",
  "discussion.remove_moderator", "discussion.ban_member", "discussion.unban_member",
  "discussion.remove_post", "discussion.remove_comment", "discussion.remove_community", "discussion.ownership_transferred"
]);

const interactionEventTypes = new Set([
  "conversation_request.created", "conversation_request.accepted", "event.rsvp_created", "moderation.report_resolved", "moderation.entity_actioned",
  "friend.requested", "friend.accepted", "organization.invited", "social.reacted", "social.commented", "social.replied",
]);

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const communitySlugPattern = /^[a-z0-9_]{3,32}$/;

export function messageNotificationHref(conversationId: string) {
  return uuid.test(conversationId) ? `/messages?conversation=${conversationId}` : "/messages";
}

export function interactionNotificationCopy(eventType:string,payload:Record<string,string>){
  if(eventType==="conversation_request.created")return{kind:"message_request",category:"message_request",title:"New message request",body:"A verified Campus Exchange member sent you a message request.",href:"/messages?view=incoming"};
  if(eventType==="conversation_request.accepted")return{kind:"message_request",category:"message_request",title:"Message request accepted",body:"Your message request was accepted.",href:messageNotificationHref(payload.conversationId??"")};
  if(eventType==="event.rsvp_created")return{kind:"event",category:"event_activity",title:"New event RSVP",body:"A verified member RSVP'd to your event.",href:uuid.test(payload.eventId??"")?`/events?event=${payload.eventId}`:"/events"};
  if(eventType==="moderation.report_resolved")return{kind:"moderation",category:"moderation_activity",title:"Report reviewed",body:"A moderation team reviewed a report you submitted.",href:"/notifications"};
  if(eventType==="moderation.entity_actioned")return{kind:"moderation",category:"moderation_activity",title:"Safety action applied",body:"A moderation team completed an action affecting your content or account. Review the outcome and appeal options.",href:uuid.test(payload.caseId??"")?`/appeals?case=${payload.caseId}`:"/appeals"};
  if(eventType==="friend.requested")return{kind:"friend_request",category:"friend_request",title:"New friend request",body:"A verified student sent you a friend request.",href:"/friends?tab=incoming"};
  if(eventType==="friend.accepted")return{kind:"friend_accepted",category:"friend_accepted",title:"Friend request accepted",body:"You are now friends.",href:"/friends"};
  if(eventType==="organization.invited")return{kind:"organization_invitation",category:"organization_invitation",title:"Organization invitation",body:"You were invited to join an organization.",href:/^[a-z0-9][a-z0-9-]{2,62}$/.test(payload.organizationSlug??"")?`/organizations/${payload.organizationSlug}`:"/organizations"};
  if(eventType==="social.reacted")return{kind:"social_reaction",category:"social_reaction",title:"New reaction",body:"A verified student reacted to your post.",href:uuid.test(payload.postId??"")?`/social?post=${payload.postId}`:"/social"};
  if(eventType==="social.commented")return{kind:"social_comment",category:"social_comment",title:"New comment",body:"A verified student commented on your post.",href:uuid.test(payload.postId??"")?`/social?post=${payload.postId}`:"/social"};
  if(eventType==="social.replied")return{kind:"social_reply",category:"social_reply",title:"New reply",body:"A verified student replied to your comment.",href:uuid.test(payload.postId??"")?`/social?post=${payload.postId}`:"/social"};
  return null;
}

export function discussionNotificationCopy(eventType: string, communitySlug: string, postId?: string, commentId?: string) {
  const href = postId && uuid.test(postId)
    ? `/discussions/posts/${postId}${commentId && uuid.test(commentId) ? `#discussion-comment-${commentId}` : ""}`
    : communitySlugPattern.test(communitySlug) ? `/discussions/c/${communitySlug}` : "/discussions?unavailable=1";
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

type EmailCategory = "messages" | "discussions";
type EmailPreference = { email_messages?: boolean; email_discussions?: boolean; quiet_hours_start?: number | null; quiet_hours_end?: number | null } | null;

export function notificationEmailAllowed(preference: EmailPreference, category: EmailCategory, now = new Date(), timeZone = "UTC") {
  if (category === "messages" && preference?.email_messages === false) return false;
  if (category === "discussions" && preference?.email_discussions === false) return false;
  const start = preference?.quiet_hours_start;
  const end = preference?.quiet_hours_end;
  if (start == null || end == null) return true;
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now));
  const quiet = start < end ? hour >= start && hour < end : hour >= start || hour < end;
  return !quiet;
}

async function canEmail(db: SupabaseClient, recipientId: string, category: EmailCategory) {
  const [preferenceResult, profileResult] = await Promise.all([
    db.from("notification_preferences").select("email_messages,email_discussions,quiet_hours_start,quiet_hours_end").eq("profile_id", recipientId).maybeSingle(),
    db.from("profiles").select("campuses!inner(timezone)").eq("id", recipientId).maybeSingle()
  ]);
  if (preferenceResult.error) throw preferenceResult.error;
  if (profileResult.error) throw profileResult.error;
  const relation = profileResult.data?.campuses as unknown as { timezone?: string } | Array<{ timezone?: string }> | undefined;
  const timeZone = (Array.isArray(relation) ? relation[0]?.timezone : relation?.timezone) ?? "UTC";
  return notificationEmailAllowed(preferenceResult.data, category, new Date(), timeZone);
}

async function deliverMessageCreated(db: SupabaseClient, event: OutboxEvent, env: Env) {
  const conversationId = event.payload.conversationId;
  const senderId = event.payload.senderId;
  if (!conversationId || !senderId) throw new Error("invalid message event payload");
  const href = messageNotificationHref(conversationId);
  const { data: participants, error } = await db.from("conversation_participants").select("profile_id").eq("conversation_id", conversationId).neq("profile_id", senderId);
  if (error) throw error;
  for (const participant of participants ?? []) {
    const recipientId = participant.profile_id as string;
    const { data: blocked } = await db.from("blocks").select("blocker_id").or(`and(blocker_id.eq.${recipientId},blocked_id.eq.${senderId}),and(blocker_id.eq.${senderId},blocked_id.eq.${recipientId})`).maybeSingle();
    if (blocked) continue;
    const notificationId = await deterministicNotificationId(event.id, recipientId);
    const { error: notificationError } = await db.from("notifications").upsert({
      id: notificationId, campus_id: event.campus_id, profile_id: recipientId, source_event_id: event.id,
      kind: "message", title: "New marketplace message", body: "A student sent you a message.", href
    }, { onConflict: "id" });
    if (notificationError) throw notificationError;
    // Email is intentionally generic: private message text never enters logs or email payloads.
    if (env.RESEND_API_KEY && env.EMAIL_FROM && await canEmail(db, recipientId, "messages")) {
      const { data: userData } = await db.auth.admin.getUserById(recipientId);
      if (userData.user?.email) {
        const resend = new Resend(env.RESEND_API_KEY);
        const delivery = await resend.emails.send(
          { from: env.EMAIL_FROM, to: userData.user.email, subject: "New message on Campus Exchange", html: `<p>You have a new marketplace message.</p><p><a href="${env.APP_ORIGIN}${href}">Open Campus Exchange</a></p>` },
          { idempotencyKey: `message-${event.id}-${recipientId}` }
        );
        if (delivery.error) throw new Error(`Resend delivery failed: ${delivery.error.name}`);
      }
    }
  }
}

async function deliverInteractionEvent(db:SupabaseClient,event:OutboxEvent){
  const recipientId=event.payload.recipientId;const actorId=event.payload.actorId;const copy=interactionNotificationCopy(event.event_type,event.payload);
  if(!recipientId||!copy)throw new Error("invalid interaction event payload");
  if(actorId&&actorId===recipientId)return;
  if(actorId){const{data:blocked,error}=await db.from("blocks").select("blocker_id").or(`and(blocker_id.eq.${recipientId},blocked_id.eq.${actorId}),and(blocker_id.eq.${actorId},blocked_id.eq.${recipientId})`).maybeSingle();if(error)throw error;if(blocked)return;}
  const notificationId=await deterministicNotificationId(event.id,recipientId);
  const{error}=await db.from("notifications").upsert({id:notificationId,campus_id:event.campus_id,profile_id:recipientId,source_event_id:event.id,kind:copy.kind,category:copy.category,title:copy.title,body:copy.body,href:copy.href},{onConflict:"id"});if(error)throw error;
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
  let postId = event.payload.postId;
  let commentId = event.payload.commentId;
  if (!postId && event.event_type === "discussion.remove_post") postId = event.payload.targetId;
  if (!postId && event.event_type === "discussion.remove_comment" && event.payload.targetId) {
    const { data, error } = await db.from("discussion_comments").select("post_id").eq("id", event.payload.targetId).maybeSingle();
    if (error) throw error;
    postId = data?.post_id as string | undefined;
    commentId = event.payload.targetId;
  }
  const copy = discussionNotificationCopy(event.event_type, communitySlug, postId, commentId);
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
  }, { onConflict: "id" });
  if (notificationError) throw notificationError;
  if (env.RESEND_API_KEY && env.EMAIL_FROM && await canEmail(db, recipientId, "discussions")) {
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
  if (event.event_type === "message.created") return event.payload.requestId ? undefined : deliverMessageCreated(db, event, env);
  if (interactionEventTypes.has(event.event_type)) return deliverInteractionEvent(db,event);
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
      const { error: deliveredError } = await db.from("outbox_events").update({ status: "delivered", processed_at: new Date().toISOString(), last_error: null }).eq("id", event.id);
      if (deliveredError) throw deliveredError;
      processed++;
    } catch (error) {
      const dead = event.attempt_count >= 8;
      const delaySeconds = retryDelaySeconds(event.attempt_count);
      const { error: retryError } = await db.from("outbox_events").update({
        status: dead ? "dead_letter" : "pending",
        available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        last_error: deliveryErrorMessage(error),
        locked_at: null
      }).eq("id", event.id);
      if (retryError) throw retryError;
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
  const { data: discussionMedia, error: discussionMediaError } = await db.from("media_uploads").select("id,object_key").in("purpose", ["community_icon", "community_banner", "discussion_post", "organization_avatar", "organization_banner", "social_post"]).eq("status", "ready").is("attached_at", null).lt("created_at", abandonedMediaCutoff).limit(100);
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
  const { error: moderationPurgeError } = await db.rpc("purge_content_moderation_data", { batch_size: 100 });
  if (moderationPurgeError) throw moderationPurgeError;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(Promise.all([runBatch(env), runMaintenance(env)])); },
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname !== "/health") return new Response("Not found", { status: 404 });
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const [database, pending, storage] = await Promise.allSettled([
      db.from("runtime_settings").select("key").limit(1),
      db.from("outbox_events").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle(),
      env.MEDIA_BUCKET.head("__campus_exchange_healthcheck__")
    ]);
    const databaseHealthy = database.status === "fulfilled" && !database.value.error;
    const outboxHealthy = pending.status === "fulfilled" && !pending.value.error;
    const storageHealthy = storage.status === "fulfilled";
    const oldest = outboxHealthy && pending.status === "fulfilled" ? pending.value.data?.created_at : null;
    const oldestPendingSeconds = oldest ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / 1000)) : 0;
    const healthy = databaseHealthy && outboxHealthy && storageHealthy && oldestPendingSeconds < 900;
    return Response.json({ status: healthy ? "ok" : "degraded", service: "campus-exchange-worker", checks: { database: databaseHealthy, outbox: outboxHealthy, objectStorage: storageHealthy, oldestPendingSeconds } }, { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } });
  }
} satisfies ExportedHandler<Env>;
