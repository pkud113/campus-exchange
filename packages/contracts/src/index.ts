import { z } from "zod";
export { openApiDocument } from "./openapi";

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
  targetType: z.enum(["listing", "event", "profile", "message", "conversation_request", "community", "discussion_post", "discussion_comment"]),
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
export const mediaPurposeSchema = z.enum(["listing", "avatar", "banner", "community_icon", "community_banner", "discussion_post"]);

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

export type ApiErrorCode = "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "rate_limited" | "service_unconfigured" | "internal_error";
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
