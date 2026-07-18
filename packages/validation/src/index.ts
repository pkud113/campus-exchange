import { z } from "zod";

export const uuid = z.string().uuid();
export const idempotencyKey = uuid;
export const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/);
export const displayName = z.string().trim().min(1).max(80);
export const biography = z.string().trim().max(1000);
export const academicField = z.string().trim().min(2).max(120);
export const graduationYear = z.number().int().min(1900).max(2200);
export const interest = z.string().trim().min(2).max(40).regex(/^[\p{L}\p{N}][\p{L}\p{N} '&+.#/-]*$/u);
export const interests = z.array(interest).max(20).transform((values) => [...new Set(values.map((value) => value.toLocaleLowerCase("en-US")))]);
export const contentVisibility = z.enum(["campus_only", "network", "friends", "members", "private"]);
export const cursorQuery = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const searchQuery = cursorQuery.extend({
  q: z.string().trim().min(2).max(120),
  types: z.array(z.enum(["profile", "listing", "organization", "event", "community", "social_post"])).max(6).optional(),
});

export function normalizedUniquePair(first: string, second: string): readonly [string, string] {
  const a = uuid.parse(first);
  const b = uuid.parse(second);
  if (a === b) throw new Error("A relationship requires two different profiles.");
  return a < b ? [a, b] : [b, a];
}
