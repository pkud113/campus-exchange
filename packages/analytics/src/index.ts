import type { ClientSurface } from "@campus-exchange/shared-types";

export const analyticsEvents = {
  appOpened: "app.session.opened",
  searchOpened: "search.results.opened",
  listingCreated: "marketplace.listing.created",
  friendRequestSent: "friends.request.sent",
  friendRequestAccepted: "friends.request.accepted",
  organizationJoined: "organizations.membership.joined",
  socialPostCreated: "social.post.created",
  eventRsvpChanged: "events.rsvp.changed",
  messageSent: "messages.message.sent",
  reportSubmitted: "safety.report.submitted",
} as const;

export type AnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
export type AnalyticsPrimitive = string | number | boolean | null;
export type AnalyticsEvent = {
  name: AnalyticsEventName;
  eventVersion: 1;
  sessionId: string;
  occurredAt: string;
  surface: ClientSurface;
  campusId?: string;
  properties: Readonly<Record<string, AnalyticsPrimitive>>;
};

const forbiddenProperty = /(?:email|body|message|comment|report|query|token|secret|url|ip|useragent)/i;

export function createAnalyticsEvent(input: Omit<AnalyticsEvent, "eventVersion" | "occurredAt"> & { occurredAt?: string }): AnalyticsEvent {
  for (const key of Object.keys(input.properties)) {
    if (forbiddenProperty.test(key)) throw new Error(`Analytics property is not privacy-safe: ${key}`);
  }
  return {
    name: input.name,
    eventVersion: 1,
    sessionId: input.sessionId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    surface: input.surface,
    ...(input.campusId ? { campusId: input.campusId } : {}),
    properties: input.properties,
  };
}
