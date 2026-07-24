import { z } from "zod";
import { academicField, biography, displayName, graduationYear, interests, searchQuery } from "@campus-exchange/validation";
import type { ApiCollection, ApiResource, UnifiedSearchHit } from "@campus-exchange/shared-types";
export { openApiDocument } from "./openapi";
export type { ApiCollection, ApiResource, UnifiedSearchHit } from "@campus-exchange/shared-types";

export const uuidSchema = z.string().uuid();
export const utcDateSchema = z.string().datetime({ offset: true });
export const cursorSchema = z.object({ cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });

export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/);
export const passwordSchema = z.string().min(12).max(72);
export const loginIdentifierSchema = z.string().trim().min(3).max(254);
export const turnstileTokenSchema = z.string().max(2048).optional();

const redirectOrigin = "https://campus-exchange.internal";

/** Returns a canonical same-origin application path, or null for unsafe input. */
export function safeInternalRedirectPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let decoded: string;
  let url: URL;
  try {
    decoded = decodeURIComponent(value);
    url = new URL(value, redirectOrigin);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.startsWith("//") || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
  if (url.origin !== redirectOrigin || url.username || url.password) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
export const institutionIdSchema = z.string().regex(/^ipeds:[0-9]{6}$/);
export const institutionSearchSchema = z.object({
  q: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
export const registrationStartSchema = z.object({
  institutionId: institutionIdSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  turnstileToken: turnstileTokenSchema
}).strict();
export const schoolRequestSchema = z.object({
  institutionId: institutionIdSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  turnstileToken: turnstileTokenSchema
}).strict();
export const schoolRequestVerifySchema = z.object({
  challengeId: uuidSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().regex(/^[0-9]{6}$/)
}).strict();
export const loginInputSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
  turnstileToken: turnstileTokenSchema,
  next: z.string().max(512).refine((value) => safeInternalRedirectPath(value) !== null, "Redirect path must stay within Campus Exchange.").transform((value) => safeInternalRedirectPath(value) as string).optional()
}).strict();
export const onboardingInputSchema = z.object({ username: usernameSchema, password: passwordSchema });
export const passwordResetStartSchema = z.object({ identifier: loginIdentifierSchema, turnstileToken: turnstileTokenSchema });
export const passwordResetCompleteSchema = z.object({ password: passwordSchema });
export const notificationPreferenceInputSchema = z.object({
  emailMessages: z.boolean(),
  emailDiscussions: z.boolean(),
  quietHoursStart: z.number().int().min(0).max(23).nullable(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable()
}).strict().refine((value) => (value.quietHoursStart === null) === (value.quietHoursEnd === null), { message: "Set both quiet-hour values or neither." })
  .refine((value) => value.quietHoursStart === null || value.quietHoursStart !== value.quietHoursEnd, { message: "Quiet hours must cover less than a full day." });

export const listingStatusSchema = z.enum(["draft", "active", "reserved", "sold", "withdrawn"]);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const listingCategorySchema = z.enum(["books", "electronics", "furniture", "clothing", "housing", "transport", "other"]);
export const contentVisibilitySchema = z.enum(["campus_only", "network"]);
export const listingExchangeMethodSchema = z.enum(["campus_pickup", "in_person_meetup", "shipping", "digital_delivery"]);
export const campusSelectorSchema = z.string().trim().toLowerCase().max(80).regex(/^(my|all|[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/).default("my");
export const listingInputSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(5000),
  category: listingCategorySchema,
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).default("USD"),
  condition: z.enum(["new", "like_new", "good", "fair", "poor"]),
  visibility: contentVisibilitySchema.default("campus_only"),
  exchangeMethods: z.array(listingExchangeMethodSchema).min(1).max(4).refine((items) => new Set(items).size === items.length, { message: "Exchange methods must be unique" }),
  idempotencyKey: z.string().uuid()
});

export const listingTransitionSchema = z.object({
  status: listingStatusSchema,
  buyerId: uuidSchema.optional(),
  idempotencyKey: z.string().uuid()
});

export const listingUpdateSchema = listingInputSchema.omit({ idempotencyKey: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one listing field to update" }
);

export const eventInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  location: z.string().trim().min(2).max(200),
  startsAt: utcDateSchema,
  endsAt: utcDateSchema,
  capacity: z.number().int().positive().max(10_000).nullable().default(null),
  visibility: contentVisibilitySchema.default("campus_only"),
  organizationId: uuidSchema.nullable().default(null),
  idempotencyKey: z.string().uuid()
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), { message: "Event must end after it starts", path: ["endsAt"] });

export const eventUpdateSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  location: z.string().trim().min(2).max(200).optional(),
  startsAt: utcDateSchema.optional(),
  endsAt: utcDateSchema.optional(),
  capacity: z.number().int().positive().max(10_000).nullable().optional(),
  visibility: contentVisibilitySchema.optional()
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one event field to update" });

export const messageInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().uuid()
});

export const reportInputSchema = z.object({
  targetType: z.enum(["listing", "event", "profile", "message", "conversation_request", "community", "discussion_post", "discussion_comment", "organization", "organization_channel", "organization_message", "organization_role", "organization_membership", "social_post", "social_comment", "institution", "account_security"]),
  targetId: uuidSchema,
  reason: z.enum(["fraud", "harassment", "prohibited_item", "spam", "unsafe", "other"]),
  details: z.string().trim().max(2000).default(""),
  idempotencyKey: z.string().uuid()
});

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).default("")
});

export const profileSearchSchema = z.object({
  q: z.string().trim().min(2).max(80),
  campus: z.string().trim().toLowerCase().max(80).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
export const conversationRequestInputSchema = z.object({
  profileId: uuidSchema,
  openingMessage: z.string().trim().min(10).max(500),
  idempotencyKey: uuidSchema,
  context: z.object({ type: z.enum(["listing", "event"]), id: uuidSchema }).optional()
});
export const conversationRequestResponseSchema = z.object({ response: z.enum(["accepted", "declined"]) });
export const contentDeletionSchema = z.object({ reason: z.string().trim().min(3).max(1000).default("User deleted content") });
export const mediaPurposeSchema = z.enum(["listing", "avatar", "banner", "community_icon", "community_banner", "discussion_post", "organization_avatar", "organization_banner", "social_post"]);

export const discussionSlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/);
export const discussionPostingPermissionSchema = z.enum(["members", "moderators", "owner"]);
export const discussionPostTypeSchema = z.enum(["text", "link", "image"]);
export const discussionSortSchema = z.enum(["hot", "new", "top", "comments"]);
export const discussionFeedQuerySchema = cursorSchema.extend({
  sort: discussionSortSchema.default("hot"),
  q: z.string().trim().max(120).optional()
});

export const discussionCommunityInputSchema = z.object({
  slug: discussionSlugSchema,
  displayName: z.string().trim().min(3).max(80),
  description: z.string().trim().max(5000).default(""),
  rules: z.string().trim().max(10000).default(""),
  postingPermission: discussionPostingPermissionSchema.default("members"),
  idempotencyKey: uuidSchema
});

export const discussionCommunityUpdateSchema = z.object({
  displayName: z.string().trim().min(3).max(80),
  description: z.string().trim().max(5000),
  rules: z.string().trim().max(10000),
  postingPermission: discussionPostingPermissionSchema,
  commentsEnabled: z.boolean()
});

export const discussionPostInputSchema = z.object({
  postType: discussionPostTypeSchema,
  title: z.string().trim().min(3).max(300),
  body: z.string().trim().max(20000).default(""),
  linkUrl: z.string().url().refine((value) => value.startsWith("https://"), "Use an HTTPS link").nullable().default(null),
  mediaId: uuidSchema.nullable().default(null),
  idempotencyKey: uuidSchema
}).superRefine((value, context) => {
  if (value.postType === "text" && !value.body) context.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "Text posts require a body" });
  if (value.postType === "link" && !value.linkUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ["linkUrl"], message: "Link posts require an HTTPS URL" });
  if (value.postType === "image" && !value.mediaId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaId"], message: "Image posts require an uploaded image" });
  if (value.postType !== "link" && value.linkUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ["linkUrl"], message: "Only link posts can include a link" });
  if (value.postType !== "image" && value.mediaId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaId"], message: "Only image posts can include uploaded media" });
});

export const discussionPostUpdateSchema = z.object({
  postType: discussionPostTypeSchema,
  title: z.string().trim().min(3).max(300),
  body: z.string().trim().max(20000).default(""),
  linkUrl: z.string().url().refine((value) => value.startsWith("https://"), "Use an HTTPS link").nullable().default(null),
  mediaId: uuidSchema.nullable().default(null)
}).superRefine((value, context) => {
  if (value.postType === "text" && !value.body) context.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "Text posts require a body" });
  if (value.postType === "link" && !value.linkUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ["linkUrl"], message: "Link posts require an HTTPS URL" });
  if (value.postType === "image" && !value.mediaId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaId"], message: "Image posts require an uploaded image" });
  if (value.postType !== "link" && value.linkUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ["linkUrl"], message: "Only link posts can include a link" });
  if (value.postType !== "image" && value.mediaId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaId"], message: "Only image posts can include uploaded media" });
});

export const discussionCommentInputSchema = z.object({
  parentCommentId: uuidSchema.nullable().default(null),
  body: z.string().trim().min(1).max(10000),
  idempotencyKey: uuidSchema
});
export const discussionCommentUpdateSchema = z.object({ body: z.string().trim().min(1).max(10000) });
export const discussionVoteSchema = z.object({ value: z.union([z.literal(-1), z.literal(1), z.null()]) });
export const discussionModerationSchema = z.object({
  action: z.enum(["remove_post", "restore_post", "lock_post", "unlock_post", "pin_post", "unpin_post", "remove_comment", "restore_comment", "ban_member", "unban_member", "add_moderator", "remove_moderator", "archive", "unarchive"]),
  targetType: z.enum(["community", "post", "comment", "member"]),
  targetId: uuidSchema,
  reason: z.string().trim().max(1000).default(""),
  idempotencyKey: uuidSchema
});
export const discussionOwnershipSchema = z.object({
  newOwnerId: uuidSchema,
  reason: z.string().trim().min(3).max(1000),
  idempotencyKey: uuidSchema
});

export type ApiErrorCode = "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "rate_limited" | "service_unconfigured" | "content_blocked" | "content_review_required" | "moderation_unavailable" | "internal_error";
export type ApiError = { error: { code: ApiErrorCode; message: string; requestId: string; details?: unknown } };
export type ApiPage<T> = { data: T[]; page: { nextCursor: string | null } };

export type Listing = {
  id: string;
  campusId: string;
  sellerId: string;
  title: string;
  description: string;
  category: z.infer<typeof listingCategorySchema>;
  condition: "new" | "like_new" | "good" | "fair" | "poor";
  priceCents: number;
  currency: string;
  status: ListingStatus;
  visibility: z.infer<typeof contentVisibilitySchema>;
  exchangeMethods: z.infer<typeof listingExchangeMethodSchema>[];
  createdAt: string;
  seller?: { handle: string; displayName: string };
  media?: { id: string; variantUrl: string; altText: string }[];
  isFavorite?: boolean;
};

export type CampusEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  visibility: z.infer<typeof contentVisibilitySchema>;
  attendeeCount: number;
  isAttending?: boolean;
};

export type DiscussionSort = z.infer<typeof discussionSortSchema>;
export type DiscussionMembershipRole = "owner" | "moderator" | "member";
export type DiscussionMembershipState = "active" | "banned" | "left";
export type DiscussionCommunity = {
  id: string;
  campusId: string;
  ownerId: string;
  slug: string;
  displayName: string;
  description: string;
  rules: string;
  iconMediaId: string | null;
  bannerMediaId: string | null;
  status: "active" | "archived" | "deleted";
  visibility: "campus_private" | "hidden";
  postingPermission: z.infer<typeof discussionPostingPermissionSchema>;
  commentsEnabled: boolean;
  memberCount: number;
  postCount: number;
  createdAt: string;
  membership?: { role: DiscussionMembershipRole; state: DiscussionMembershipState } | null;
};
export type DiscussionPost = {
  id: string;
  communityId: string;
  authorId: string | null;
  postType: z.infer<typeof discussionPostTypeSchema>;
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  mediaId: string | null;
  score: number;
  commentCount: number;
  saveCount: number;
  isPinned: boolean;
  lockedAt: string | null;
  removedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  viewerVote?: -1 | 0 | 1;
  viewerSaved?: boolean;
};
export type DiscussionComment = {
  id: string;
  postId: string;
  authorId: string | null;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  score: number;
  replyCount: number;
  removedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  viewerVote?: -1 | 0 | 1;
  author?: { handle?: string; display_name?: string | null };
  children?: DiscussionComment[];
};

export const profileVisibilitySchema = z.enum(["campus_only", "network", "friends", "private"]);
export const expandedProfileInputSchema = z.object({
  displayName,
  biography,
  academicField: academicField.nullable(),
  graduationYear: graduationYear.nullable(),
  graduationYearVisible: z.boolean(),
  academicFieldVisible: z.boolean(),
  interests,
  visibility: profileVisibilitySchema,
  friendListVisibility: profileVisibilitySchema,
  organizationMembershipVisibility: profileVisibilitySchema,
  activityVisibility: profileVisibilitySchema,
}).strict();

export const friendRequestInputSchema = z.object({ profileId: uuidSchema, idempotencyKey: uuidSchema }).strict();
export const friendResponseInputSchema = z.object({ action: z.enum(["accept", "decline"]), idempotencyKey: uuidSchema }).strict();
export const friendRemovalInputSchema = z.object({ idempotencyKey: uuidSchema }).strict();

export const organizationSlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,62}$/);
export const organizationRoleSchema = z.enum(["owner", "administrator", "moderator", "officer", "member"]);
export const organizationMembershipPolicySchema = z.enum(["open", "approval_required", "invitation_only"]);
export const organizationInputSchema = z.object({
  slug: organizationSlugSchema,
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  visibility: z.enum(["campus_only", "network"]),
  membershipPolicy: organizationMembershipPolicySchema,
  websiteUrl: z.string().url().refine((value) => value.startsWith("https://"), "Use an HTTPS link").nullable(),
  idempotencyKey: uuidSchema,
}).strict();
export const organizationMembershipInputSchema = z.object({
  action: z.enum(["request", "invite", "accept", "decline", "cancel", "remove", "ban", "unban", "change_role", "transfer_ownership"]),
  profileId: uuidSchema.optional(),
  profileHandle: usernameSchema.optional(),
  role: organizationRoleSchema.optional(),
  confirmation: z.string().trim().max(120).optional(),
  idempotencyKey: uuidSchema,
}).strict().superRefine((value, context) => {
  if (value.action === "invite" && !value.profileId && !value.profileHandle) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profileHandle"], message: "Choose a member to invite" });
  if (value.action === "transfer_ownership" && !value.profileId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["profileId"], message: "Choose the intended successor" });
  if (value.action === "transfer_ownership" && !value.confirmation) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmation"], message: "Confirm the organization name" });
});

export const organizationChannelInputSchema = z.object({
  categoryId: uuidSchema.nullable(),
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,49}$/),
  description: z.string().trim().max(500).default(""),
  type: z.enum(["text", "announcement"]),
  visibility: z.enum(["standard", "restricted"]),
  slowModeSeconds: z.number().int().min(0).max(21600).default(0),
  allowedRoleIds: z.array(uuidSchema).max(20).default([]),
  idempotencyKey: uuidSchema,
}).strict();

export const organizationCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  sortPosition: z.number().int().min(0).max(32767).default(0),
  idempotencyKey: uuidSchema,
}).strict();

export const organizationMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentMessageId: uuidSchema.nullable(),
  idempotencyKey: uuidSchema,
}).strict();

export const organizationMessageMutationSchema = z.object({
  action: z.enum(["edit", "delete"]),
  body: z.string().trim().min(1).max(4000).default(""),
  reason: z.string().trim().max(1000).default(""),
}).superRefine((value, context) => {
  if (value.action === "edit" && !value.body) context.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "Edited messages require text" });
});

export const organizationRoleAssignmentSchema = z.object({
  roleId: uuidSchema,
  profileId: uuidSchema,
  action: z.enum(["assign", "remove"]),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const organizationPermissionSchema = z.enum([
  "view_organization", "view_channels", "send_messages", "manage_messages", "create_announcements",
  "manage_channels", "manage_roles", "assign_roles", "invite_members", "approve_membership_requests",
  "remove_members", "ban_members", "manage_organization_profile", "create_organization_events",
  "create_organization_posts", "view_audit_log",
]);

export const organizationRoleMutationSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  roleId: uuidSchema.nullable().default(null),
  name: z.string().trim().min(1).max(40).default("Custom role"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#476657"),
  sortPosition: z.number().int().min(0).max(32767).default(50),
  authorityRank: z.number().int().min(1).max(99).default(20),
  permissions: z.array(organizationPermissionSchema).max(16).refine((values) => new Set(values).size === values.length, "Permissions must be unique").default([]),
}).strict().superRefine((value, context) => {
  if (value.action !== "create" && !value.roleId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["roleId"], message: "A role is required" });
});

const permissionOverrideSchema = z.enum(["inherit", "allow", "deny"]);
export const organizationChannelOverrideSchema = z.object({
  targetType: z.enum(["role", "member"]),
  targetId: uuidSchema,
  viewChannel: permissionOverrideSchema,
  sendMessages: permissionOverrideSchema,
  manageMessages: permissionOverrideSchema,
  createAnnouncements: permissionOverrideSchema,
}).strict();

export const moderationCaseActionSchema = z.object({
  action: z.enum(["dismiss", "warn", "hide_content", "remove_content", "restore_content", "restrict_content", "lock_content", "temporary_account_restriction", "suspend", "restore", "ban_account", "restrict_organization", "suspend_organization", "remove_organization", "restrict_channel", "delete_channel_message", "remove_organization_role", "remove_organization_member", "restrict_community", "remove_listing", "cancel_event", "escalate", "request_information", "approve_content", "uphold_block"]),
  reason: z.string().trim().min(3).max(1000),
  userMessage: z.string().trim().min(3).max(1000).nullable().default(null),
  restrictionUntil: utcDateSchema.nullable().default(null),
}).strict();

export const moderationAppealSchema = z.object({
  statement: z.string().trim().min(20).max(4000),
  idempotencyKey: uuidSchema,
}).strict();

export const contentModerationReviewSchema = z.object({ checkId: uuidSchema, idempotencyKey: uuidSchema }).strict();

export const moderationAppealDecisionSchema = z.object({
  action: z.enum(["assign", "approve", "reject", "request_information"]),
  reviewerId: uuidSchema.nullable().default(null),
  internalReason: z.string().trim().min(3).max(2000),
  userResolution: z.string().trim().max(2000).default(""),
  reverseAction: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.action !== "assign" && value.userResolution.length < 3) context.addIssue({ code: z.ZodIssueCode.custom, path: ["userResolution"], message: "A user-visible message is required" });
  if (value.action === "reject" && value.reverseAction) context.addIssue({ code: z.ZodIssueCode.custom, path: ["reverseAction"], message: "An upheld appeal cannot reverse an action" });
});

export const socialPostInputSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  mediaIds: z.array(uuidSchema).max(4).refine((values) => new Set(values).size === values.length, "Media IDs must be unique"),
  visibility: z.enum(["campus_only", "network", "friends"]),
  organizationId: uuidSchema.nullable(),
  idempotencyKey: uuidSchema,
}).strict();
export const socialPostUpdateSchema = socialPostInputSchema.omit({ idempotencyKey: true, organizationId: true });
export const socialFeedQuerySchema = cursorSchema.extend({
  scope: z.enum(["for_you", "campus", "friends", "network"]).default("for_you"),
  author: uuidSchema.optional(),
});
export const socialReactionInputSchema = z.object({ reaction: z.enum(["like", "celebrate", "support", "insightful"]).nullable() }).strict();
export const socialCommentInputSchema = z.object({ body: z.string().trim().min(1).max(4000), parentCommentId: uuidSchema.nullable(), idempotencyKey: uuidSchema }).strict();
export const socialCommentUpdateSchema = socialCommentInputSchema.pick({ body: true });
export const socialPostMutationSchema = z.object({ action: z.enum(["edit", "delete"]), body: z.string().trim().max(10000).default(""), reason: z.string().trim().max(1000).default("") }).superRefine((value, context) => {
  if (value.action === "edit" && !value.body) context.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "Edited posts require a caption" });
});
export const socialCommentMutationSchema = z.object({ action: z.enum(["edit", "delete"]), body: z.string().trim().max(4000).default("") }).superRefine((value, context) => {
  if (value.action === "edit" && !value.body) context.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "Edited comments require text" });
});

export const unifiedSearchQuerySchema = searchQuery.extend({ campus: z.string().trim().toLowerCase().max(80).optional() });
export const notificationCategorySchema = z.enum([
  "friend_request", "friend_accepted", "message", "message_request", "social_reaction", "social_comment", "social_reply",
  "organization_invitation", "organization_membership", "event_activity", "discussion_activity", "moderation_activity", "security_activity",
]);

export const registrationOutcomeSchema = z.enum([
  "SUPPORTED_AND_OPEN",
  "DIRECTORY_LISTED_DOMAIN_REVIEW_REQUIRED",
  "AMBIGUOUS_OR_SHARED_DOMAIN",
  "CAMPUS_REGISTRATION_PAUSED",
  "DOMAIN_DISABLED",
  "ALUMNI_DOMAIN",
  "INSTITUTION_NOT_SUPPORTED",
  "INSTITUTION_DOMAIN_MISMATCH",
  "VERIFICATION_REQUEST_PENDING",
  "GLOBAL_SERVICE_UNAVAILABLE",
]);

export type RegistrationOutcome = z.infer<typeof registrationOutcomeSchema>;

export type ExpandedProfileInput = z.infer<typeof expandedProfileInputSchema>;
export type OrganizationInput = z.infer<typeof organizationInputSchema>;
export type SocialPostInput = z.infer<typeof socialPostInputSchema>;
export type SocialFeedQuery = z.infer<typeof socialFeedQuerySchema>;
export type UnifiedSearchResponse = ApiCollection<UnifiedSearchHit>;
export type FriendMutationResponse = ApiResource<{ relationshipId: string; status: "pending" | "accepted" | "declined" | "cancelled" | "removed" }>;
