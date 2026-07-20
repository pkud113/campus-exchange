export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type Uuid = Brand<string, "Uuid">;
export type IsoDateTime = Brand<string, "IsoDateTime">;
export type Cursor = Brand<string, "Cursor">;

export type ContentVisibility = "campus_only" | "network" | "friends" | "members" | "private";
export type ClientSurface = "web_desktop" | "web_mobile" | "ios" | "android";
export type EntityKind = "profile" | "listing" | "organization" | "event" | "community" | "social_post";
export type NotificationCategory =
  | "friend_request"
  | "friend_accepted"
  | "message"
  | "message_request"
  | "social_reaction"
  | "social_comment"
  | "social_reply"
  | "organization_invitation"
  | "organization_membership"
  | "event_activity"
  | "discussion_activity"
  | "moderation_activity"
  | "security_activity";

export type FriendRelationshipStatus = "pending" | "accepted" | "declined" | "cancelled" | "removed";
export type OrganizationRole = "owner" | "administrator" | "moderator" | "officer" | "member";
export type OrganizationMembershipStatus = "pending" | "invited" | "active" | "declined" | "cancelled" | "removed" | "banned";

export type RegistrationOutcome =
  | "SUPPORTED_AND_OPEN"
  | "DIRECTORY_LISTED_DOMAIN_REVIEW_REQUIRED"
  | "AMBIGUOUS_OR_SHARED_DOMAIN"
  | "CAMPUS_REGISTRATION_PAUSED"
  | "DOMAIN_DISABLED"
  | "ALUMNI_DOMAIN"
  | "INSTITUTION_NOT_SUPPORTED"
  | "INSTITUTION_DOMAIN_MISMATCH"
  | "VERIFICATION_REQUEST_PENDING"
  | "GLOBAL_SERVICE_UNAVAILABLE";

export type PageMeta = { nextCursor: string | null; count?: number };
export type ApiCollection<T> = { data: T[]; meta: PageMeta };
export type ApiResource<T> = { data: T };
export type FieldErrors = Record<string, readonly string[]>;
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
    fieldErrors?: FieldErrors;
  };
};

export type CampusContext = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
};

export type ProfileSummary = {
  id: string;
  username: string;
  displayName: string;
  avatarMediaId: string | null;
  campus: CampusContext;
  friendStatus?: FriendRelationshipStatus | "blocked" | "self" | null;
  mutualFriendCount?: number;
};

export type UnifiedSearchHit = {
  id: string;
  kind: EntityKind;
  title: string;
  subtitle: string | null;
  href: string;
  imageMediaId: string | null;
  campus: Pick<CampusContext, "slug" | "shortName"> | null;
  visibility: ContentVisibility;
  occurredAt: string;
};
