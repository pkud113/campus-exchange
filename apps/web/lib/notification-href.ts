const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const uuid = new RegExp(`^${uuidPattern}$`, "i");
const discussionCommentHash = new RegExp(`^#discussion-comment-${uuidPattern}$`, "i");
const communitySlug = /^[a-z0-9_]{3,32}$/;
const internalOrigin = "https://campus-exchange.internal";

function fallbackFor(kind?: string) {
  if (kind === "message" || kind === "message_request") return "/messages";
  if (kind === "discussion") return "/discussions?unavailable=1";
  if (kind === "listing" || kind === "favorite") return "/marketplace";
  if (kind === "event") return "/events";
  if (kind === "report" || kind === "moderation") return "/admin";
  return "/notifications?unavailable=1";
}

function safeCommentHash(hash: string) {
  return discussionCommentHash.test(hash) ? hash : "";
}

/** Canonicalizes stored notification links to the current, internal App Router surface. */
export function notificationHref(rawHref: string | null | undefined, kind?: string) {
  const fallback = fallbackFor(kind);
  if (!rawHref || !rawHref.startsWith("/") || rawHref.startsWith("//") || rawHref.includes("\\")) return fallback;

  let url: URL;
  try {
    url = new URL(rawHref, internalOrigin);
  } catch {
    return fallback;
  }
  if (url.origin !== internalOrigin || url.username || url.password) return fallback;

  const legacyDiscussionPost = url.pathname.match(new RegExp(`^/discussions/c/[a-z0-9_]{3,32}/posts/(${uuidPattern})$`, "i"));
  if (legacyDiscussionPost) return `/discussions/posts/${legacyDiscussionPost[1]}${safeCommentHash(url.hash)}`;

  const legacyDiscussionComment = url.pathname.match(new RegExp(`^/discussions/posts/(${uuidPattern})/comments/(${uuidPattern})$`, "i"));
  if (legacyDiscussionComment) return `/discussions/posts/${legacyDiscussionComment[1]}#discussion-comment-${legacyDiscussionComment[2]}`;

  const post = url.pathname.match(new RegExp(`^/discussions/posts/(${uuidPattern})$`, "i"));
  if (post) return `/discussions/posts/${post[1]}${safeCommentHash(url.hash)}`;

  const community = url.pathname.match(/^\/discussions\/c\/([^/]+)$/);
  if (community && communitySlug.test(community[1] ?? "")) return `/discussions/c/${community[1]}`;

  const listing = url.pathname.match(new RegExp(`^/(?:marketplace|listings)/(${uuidPattern})$`, "i"));
  if (listing) return `/listings/${listing[1]}`;

  const legacyEvent = url.pathname.match(new RegExp(`^/events/(${uuidPattern})$`, "i"));
  if (legacyEvent) return `/events?event=${legacyEvent[1]}#event-${legacyEvent[1]}`;

  if (url.pathname === "/events") {
    const eventId = url.searchParams.get("event");
    return eventId && uuid.test(eventId) ? `/events?event=${eventId}#event-${eventId}` : "/events";
  }

  if (url.pathname === "/messages" || url.pathname === "/messages/requests") {
    const conversationId = url.searchParams.get("conversation");
    return conversationId && uuid.test(conversationId) ? `/messages?conversation=${conversationId}` : "/messages";
  }

  if (url.pathname === "/admin" || url.pathname.startsWith("/reports/")) {
    const pathReport = url.pathname.match(new RegExp(`^/reports/(${uuidPattern})$`, "i"))?.[1];
    const reportId = pathReport ?? url.searchParams.get("report");
    return reportId && uuid.test(reportId) ? `/admin?report=${reportId}` : "/admin";
  }

  if (["/home", "/marketplace", "/discussions", "/notifications"].includes(url.pathname)) return url.pathname;
  return fallback;
}
