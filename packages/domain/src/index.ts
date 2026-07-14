import type { ListingStatus } from "@campus-exchange/contracts";

const transitions: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ["active", "withdrawn"],
  active: ["reserved", "sold", "withdrawn"],
  reserved: ["active", "sold", "withdrawn"],
  sold: [],
  withdrawn: []
};

export function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean {
  return transitions[from].includes(to);
}

export function assertListingTransition(from: ListingStatus, to: ListingStatus, buyerId?: string): void {
  if (!canTransitionListing(from, to)) throw new DomainError("invalid_listing_transition", `Cannot move a listing from ${from} to ${to}`);
  if ((to === "reserved" || to === "sold") && !buyerId) throw new DomainError("buyer_required", `A buyer is required when marking a listing ${to}`);
}

export function normalizeSchoolDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) throw new DomainError("invalid_email", "Enter a valid school email address");
  return email.slice(at + 1).toLowerCase().replace(/\.$/, "");
}

export function isVerificationCurrent(verifiedAt: Date, now = new Date()): boolean {
  const expiresAt = new Date(verifiedAt);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
  return expiresAt > now;
}

export function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 72) throw new DomainError("invalid_password", "Password must be between 12 and 72 characters");
}

export function canRespondToConversationRequest(status: string, isRecipient: boolean): boolean {
  return status === "pending" && isRecipient;
}

export function canCreateDirectConversationRequest(input: { requesterId: string; recipientId: string; sameCampus: boolean; blocked: boolean; pendingExists: boolean; conversationExists: boolean }): boolean {
  return input.requesterId !== input.recipientId && input.sameCampus && !input.blocked && !input.pendingExists && !input.conversationExists;
}

export function canManageOwnedContent(actorId: string, ownerId: string, isStaff: boolean, hasMfa: boolean): boolean {
  return actorId === ownerId || (isStaff && hasMfa);
}

export function purgeAt(deletedAt: Date, retentionDays = 30): Date {
  const result = new Date(deletedAt);
  result.setUTCDate(result.getUTCDate() + retentionDays);
  return result;
}

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "DomainError"; }
}
