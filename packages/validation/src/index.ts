import { z } from "zod";

export const uuid = z.string().uuid();
export const idempotencyKey = uuid;
export const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/);
export const usernameInput = z.string().trim().min(1).max(64);
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

export const USERNAME_POLICY_VERSION = "ce-username-2026-07-v1";

export type UsernameSafetyReason =
  | "invalid_characters"
  | "invalid_length"
  | "invalid_separators"
  | "unicode_confusable"
  | "reserved"
  | "impersonation"
  | "profanity"
  | "hateful_or_abusive";

export type UsernameSafetyResult =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameSafetyReason };

const zeroWidthAndBidi = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const asciiUsername = /^[a-z0-9_]+$/;
const invalidSeparators = /^_|_$|__/;
const reservedTokens = new Set([
  "admin", "administrator", "api", "campus", "founder", "help", "helpdesk",
  "mod", "moderator", "official", "owner", "root", "security", "staff", "support",
  "system", "verified", "www",
]);
const reservedCompacts = new Set([
  ...reservedTokens,
  "campusexchange", "campusexchangeadmin", "campusexchangemoderator",
  "campusexchangeofficial", "campusexchangesecurity", "campusexchangestaff",
  "campusexchangesupport",
]);
const profanityPattern = /(fuck|shit|bitch|cunt|asshole|motherfucker|dickhead)/;
const hatefulOrAbusivePattern = /(nigger|faggot|kike|chink|spic|wetback|tranny|retard|killyourself|gasjews)/;
const impersonationPattern =
  /^(official|verified|real)(msu|umich|campus|support|staff|admin|moderator)|(msu|umich|campus)(official|verified|support|staff|admin|moderator)$/;

function safetySkeleton(usernameValue: string): string {
  return usernameValue
    .replaceAll("_", "")
    .replaceAll("0", "o")
    .replaceAll("1", "i")
    .replaceAll("3", "e")
    .replaceAll("4", "a")
    .replaceAll("5", "s")
    .replaceAll("7", "t")
    .replace(/([a-z])\1{2,}/g, "$1");
}

export function normalizeUsernameInput(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

/**
 * Validates an immutable public handle without network or provider dependencies.
 * Non-ASCII lookalikes and invisible format controls are rejected instead of
 * silently rewritten; compatibility characters such as full-width ASCII are
 * canonicalized by NFKC.
 */
export function evaluateUsernameSafety(value: string): UsernameSafetyResult {
  if (zeroWidthAndBidi.test(value)) return { ok: false, reason: "unicode_confusable" };
  const normalized = normalizeUsernameInput(value);
  const length = Array.from(normalized).length;
  if (length < 3 || length > 24) return { ok: false, reason: "invalid_length" };
  if (!asciiUsername.test(normalized)) return { ok: false, reason: "unicode_confusable" };
  if (invalidSeparators.test(normalized)) return { ok: false, reason: "invalid_separators" };

  const tokens = normalized.split("_");
  const skeleton = safetySkeleton(normalized);
  if (tokens.some((token) => reservedTokens.has(token)) || reservedCompacts.has(skeleton)) {
    return { ok: false, reason: "reserved" };
  }
  if (impersonationPattern.test(skeleton)) return { ok: false, reason: "impersonation" };
  if (profanityPattern.test(skeleton)) return { ok: false, reason: "profanity" };
  if (hatefulOrAbusivePattern.test(skeleton)) return { ok: false, reason: "hateful_or_abusive" };
  return { ok: true, username: normalized };
}

export function usernameSafetyMessage(reason: UsernameSafetyReason): string {
  switch (reason) {
    case "invalid_length":
      return "Username must be between 3 and 24 characters.";
    case "invalid_characters":
    case "invalid_separators":
    case "unicode_confusable":
      return "Use 3–24 lowercase letters, numbers, or single underscores without lookalike characters.";
    case "reserved":
    case "impersonation":
      return "That username is reserved and cannot be used.";
    case "profanity":
    case "hateful_or_abusive":
      return "That username does not meet the Campus Exchange username policy.";
  }
}
