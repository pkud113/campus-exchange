import { z } from "zod";
export { openApiDocument } from "./openapi";

export const uuidSchema = z.string().uuid();
export const utcDateSchema = z.string().datetime({ offset: true });
export const cursorSchema = z.object({ cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });

export const listingStatusSchema = z.enum(["draft", "active", "reserved", "sold", "withdrawn"]);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const listingCategorySchema = z.enum(["books", "electronics", "furniture", "clothing", "housing", "transport", "other"]);
export const listingInputSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(5000),
  category: listingCategorySchema,
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).default("USD"),
  condition: z.enum(["new", "like_new", "good", "fair", "poor"]),
  idempotencyKey: z.string().uuid()
});

export const listingTransitionSchema = z.object({
  status: listingStatusSchema,
  buyerId: uuidSchema.optional(),
  idempotencyKey: z.string().uuid()
});

export const eventInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  location: z.string().trim().min(2).max(200),
  startsAt: utcDateSchema,
  endsAt: utcDateSchema,
  capacity: z.number().int().positive().max(10_000).nullable().default(null),
  idempotencyKey: z.string().uuid()
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), { message: "Event must end after it starts", path: ["endsAt"] });

export const messageInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().uuid()
});

export const reportInputSchema = z.object({
  targetType: z.enum(["listing", "event", "profile", "message"]),
  targetId: uuidSchema,
  reason: z.enum(["fraud", "harassment", "prohibited_item", "spam", "unsafe", "other"]),
  details: z.string().trim().max(2000).default(""),
  idempotencyKey: z.string().uuid()
});

export const profileInputSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/),
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).default("")
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
  attendeeCount: number;
  isAttending?: boolean;
};
