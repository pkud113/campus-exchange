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
  | "UNIVERSAL_VERIFICATION_REQUIRED"
  | "DIRECTORY_LISTED_DOMAIN_REVIEW_REQUIRED"
  | "AMBIGUOUS_OR_SHARED_DOMAIN"
  | "CAMPUS_REGISTRATION_PAUSED"
  | "DOMAIN_DISABLED"
  | "ALUMNI_DOMAIN"
  | "INSTITUTION_NOT_SUPPORTED"
  | "INSTITUTION_DOMAIN_MISMATCH"
  | "VERIFICATION_REQUEST_PENDING"
  | "GLOBAL_SERVICE_UNAVAILABLE";

export type InstitutionLifecycle = "active" | "all";
export type InstitutionPresence = "any" | "provisioned" | "unprovisioned";
export type InstitutionFilter = "my" | "all" | `ipeds:${string}`;
export type MembershipVerificationBasis =
  | "reviewed"
  | "website_matched"
  | "shared_selected"
  | "explicit_selected"
  | "legacy_reviewed";

export type InstitutionSearchResult = {
  id: string;
  name: string;
  aliases: string[];
  city: string;
  region: string;
  status: "active" | "inactive" | "closed" | "merged" | "renamed" | "duplicate";
  registrationStatus: "open" | "suspended" | "closed";
  availability: "available" | "paused" | "closed";
  campus: (CampusContext & { status: "enabled" | "disabled" | "suspended" }) | null;
};

export type EnrollmentGrantOutcome = {
  grantId: string;
  expiresAt: string;
  institution: Pick<InstitutionSearchResult, "id" | "name" | "city" | "region">;
  assignmentBasis: MembershipVerificationBasis;
};

export type PagedBox<T, Counts extends Record<string, number>> = {
  items: T[];
  counts: Counts;
  nextCursor: string | null;
};

export type FriendBoxCounts = { all: number; incoming: number; sent: number };
export type FriendBoxItem = {
  relationshipId: string;
  direction: "incoming" | "sent" | "friend";
  status: FriendRelationshipStatus;
  profile: ProfileSummary;
  mutualPreview: ProfileSummary[];
  updatedAt: string;
};

export type MessageRequestBoxCounts = { incoming: number; sent: number; pending: number };
export type MessageRequestBoxItem = {
  conversationId: string;
  direction: "incoming" | "sent";
  status: "pending" | "accepted" | "declined" | "cancelled" | "unavailable";
  counterpart: ProfileSummary;
  context: { kind: string; id: string; href: string | null } | null;
  openingMessage: string;
  history: Array<{ status: string; at: string }>;
  createdAt: string;
  updatedAt: string;
};

export type ReactionSummary = {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
};

export type NotificationCategoryPreference = {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  mandatoryInApp: boolean;
};

export type StaffCapability =
  | "institutions.read"
  | "institutions.manage"
  | "users.read"
  | "users.restrict"
  | "staff.manage"
  | "cases.read"
  | "cases.act"
  | "content.read"
  | "content.act"
  | "appeals.act"
  | "audit.read"
  | "settings.manage"
  | "campus_moderators.manage";

export type AdminScope =
  | { kind: "platform" }
  | { kind: "campus"; campusId: string };

export type AuditedAdminAction = {
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  idempotencyKey: string;
};

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
