import { describe, expect, it } from "vitest";
import { deliveryErrorMessage, deterministicNotificationId, discussionNotificationCopy, interactionNotificationCopy, messageNotificationHref, notificationEmailAllowed, retryDelaySeconds, shouldSuppressDiscussionNotification } from "./index";

describe("worker delivery helpers", () => {
  it("creates stable version-5 UUIDs", async () => {
    const first = await deterministicNotificationId("event", "recipient");
    expect(await deterministicNotificationId("event", "recipient")).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("caps exponential retry delays at one hour", () => {
    expect(retryDelaySeconds(0)).toBe(15);
    expect(retryDelaySeconds(20)).toBe(3600);
  });
  it.each([
    "discussion.post_replied", "discussion.comment_replied", "discussion.add_moderator",
    "discussion.remove_moderator", "discussion.ban_member", "discussion.unban_member",
    "discussion.remove_post", "discussion.remove_comment", "discussion.remove_community", "discussion.ownership_transferred"
  ])("creates generic, content-free copy for %s", (eventType) => {
    const result = discussionNotificationCopy(eventType, "campus_life", "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222");
    expect(result.title.length).toBeGreaterThan(3);
    expect(result.body.length).toBeGreaterThan(3);
    expect(result.href).toBe("/discussions/posts/11111111-1111-1111-1111-111111111111#discussion-comment-22222222-2222-2222-2222-222222222222");
    expect(JSON.stringify(result)).not.toMatch(/email|signed url|credential/i);
  });
  it("preserves structured delivery errors", () => {
    expect(deliveryErrorMessage({ message: "conflict target unavailable" })).toBe("conflict target unavailable");
  });
  it("keeps message links on the internal messages route", () => {
    expect(messageNotificationHref("11111111-1111-1111-1111-111111111111")).toBe("/messages?conversation=11111111-1111-1111-1111-111111111111");
    expect(messageNotificationHref("https://example.com")).toBe("/messages");
  });
  it("suppresses self notifications defensively", () => {
    expect(shouldSuppressDiscussionNotification({ actorId: "same", recipientId: "same" })).toBe(true);
    expect(shouldSuppressDiscussionNotification({ actorId: "a", recipientId: "b" })).toBe(false);
  });
  it("canonicalizes network interaction routes",()=>{
    expect(interactionNotificationCopy("conversation_request.created",{} )?.href).toBe("/messages?view=incoming");
    expect(interactionNotificationCopy("conversation_request.accepted",{conversationId:"11111111-1111-1111-1111-111111111111"})?.href).toContain("conversation=");
    expect(interactionNotificationCopy("event.rsvp_created",{eventId:"22222222-2222-2222-2222-222222222222"})?.href).toBe("/events?event=22222222-2222-2222-2222-222222222222");
    expect(interactionNotificationCopy("moderation.report_resolved",{})?.href).toBe("/notifications");
  });
  it("honors email categories and overnight quiet hours", () => {
    const overnight = { email_messages: true, email_discussions: false, quiet_hours_start: 22, quiet_hours_end: 7 };
    expect(notificationEmailAllowed(overnight, "messages", new Date("2026-01-01T23:00:00Z"))).toBe(false);
    expect(notificationEmailAllowed(overnight, "messages", new Date("2026-01-01T12:00:00Z"))).toBe(true);
    expect(notificationEmailAllowed(overnight, "discussions", new Date("2026-01-01T12:00:00Z"))).toBe(false);
    expect(notificationEmailAllowed(null, "messages", new Date("2026-01-01T23:00:00Z"))).toBe(true);
  });
});
