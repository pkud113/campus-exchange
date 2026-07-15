import { describe, expect, it } from "vitest";
import { notificationHref } from "./notification-href";

const postId = "11111111-1111-4111-8111-111111111111";
const commentId = "22222222-2222-4222-8222-222222222222";

describe("notificationHref", () => {
  it("maps legacy routes to current App Router destinations", () => {
    expect(notificationHref("/messages/requests", "message_request")).toBe("/messages");
    expect(notificationHref(`/discussions/c/campus_life/posts/${postId}#discussion-comment-${commentId}`, "discussion"))
      .toBe(`/discussions/posts/${postId}#discussion-comment-${commentId}`);
    expect(notificationHref(`/events/${postId}`, "event")).toBe(`/events?event=${postId}#event-${postId}`);
  });

  it("rejects external and malformed destinations", () => {
    expect(notificationHref("https://example.com", "listing")).toBe("/marketplace");
    expect(notificationHref("//example.com/path", "discussion")).toBe("/discussions?unavailable=1");
  });
});
