import type { ListingStatus } from "@campus-exchange/contracts";
import type { ContentVisibility, OrganizationRole } from "@campus-exchange/shared-types";
import type { RegistrationOutcome } from "@campus-exchange/shared-types";

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

export type InstitutionRegistrationDecision = Exclude<RegistrationOutcome, "VERIFICATION_REQUEST_PENDING" | "GLOBAL_SERVICE_UNAVAILABLE">;

export const registrationOutcomeMessages: Record<RegistrationOutcome, string> = {
  SUPPORTED_AND_OPEN: "This school and email domain are approved. Continue to verify your school email.",
  DIRECTORY_LISTED_DOMAIN_REVIEW_REQUIRED: "Your school is in the Campus Exchange directory, but this email domain has not been approved for registration yet.",
  AMBIGUOUS_OR_SHARED_DOMAIN: "This email domain cannot currently be assigned safely to one campus. Registration will remain unavailable until the domain mapping is reviewed.",
  CAMPUS_REGISTRATION_PAUSED: "Registration for this campus is currently paused.",
  DOMAIN_DISABLED: "This school email domain is currently unavailable for registration.",
  ALUMNI_DOMAIN: "Alumni email addresses cannot be used for student registration.",
  INSTITUTION_NOT_SUPPORTED: "This institution is not currently open for Campus Exchange registration.",
  INSTITUTION_DOMAIN_MISMATCH: "This school email domain is approved for a different institution. Check the selected school.",
  VERIFICATION_REQUEST_PENDING: "We verified ownership of your school email. Registration will remain pending while the campus-domain mapping is reviewed.",
  GLOBAL_SERVICE_UNAVAILABLE: "Registration is temporarily unavailable due to a service problem. Please try again later.",
};

export function decideInstitutionRegistration(input: {
  staffInvite: boolean;
  institutionRegistrationStatus: "open" | "suspended" | "closed";
  selectedCampusId: string | null;
  resolution: string;
  resolvedCampusId: string | null;
}): InstitutionRegistrationDecision {
  if (input.staffInvite) return "SUPPORTED_AND_OPEN";
  if (input.institutionRegistrationStatus === "suspended") return "CAMPUS_REGISTRATION_PAUSED";
  if (input.institutionRegistrationStatus !== "open") return "INSTITUTION_NOT_SUPPORTED";
  if (input.resolution === "eligible") {
    return input.selectedCampusId && input.selectedCampusId === input.resolvedCampusId
      ? "SUPPORTED_AND_OPEN"
      : "INSTITUTION_DOMAIN_MISMATCH";
  }
  if (input.resolution === "ambiguous") return "AMBIGUOUS_OR_SHARED_DOMAIN";
  if (input.resolution === "alumni") return "ALUMNI_DOMAIN";
  if (input.resolution === "campus_disabled") return "CAMPUS_REGISTRATION_PAUSED";
  if (input.resolution === "domain_disabled") return "DOMAIN_DISABLED";
  return "DIRECTORY_LISTED_DOMAIN_REVIEW_REQUIRED";
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

export function canCreateDirectConversationRequest(input: { requesterId: string; recipientId: string; sameCampus: boolean; networkEnabled: boolean; blocked: boolean; pendingExists: boolean; conversationExists: boolean }): boolean {
  return input.requesterId !== input.recipientId && (input.sameCampus || input.networkEnabled) && !input.blocked && !input.pendingExists && !input.conversationExists;
}

export function canManageOwnedContent(actorId: string, ownerId: string, isStaff: boolean, hasMfa: boolean): boolean {
  return actorId === ownerId || (isStaff && hasMfa);
}

export function purgeAt(deletedAt: Date, retentionDays = 30): Date {
  const result = new Date(deletedAt);
  result.setUTCDate(result.getUTCDate() + retentionDays);
  return result;
}

export type DiscussionRole = "owner" | "moderator" | "member";
export type DiscussionState = "active" | "banned" | "left";
export type DiscussionPostingPermission = "members" | "moderators" | "owner";

export function isValidDiscussionSlug(value: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(value);
}

export function canPostInDiscussion(input: {
  role: DiscussionRole;
  state: DiscussionState;
  permission: DiscussionPostingPermission;
  communityStatus: "active" | "archived" | "deleted";
}): boolean {
  if (input.state !== "active" || input.communityStatus !== "active") return false;
  if (input.permission === "owner") return input.role === "owner";
  if (input.permission === "moderators") return input.role === "owner" || input.role === "moderator";
  return true;
}

export function canModerateDiscussion(role: DiscussionRole, state: DiscussionState): boolean {
  return state === "active" && (role === "owner" || role === "moderator");
}

export function canCommentInDiscussion(input: {
  state: DiscussionState;
  communityStatus: "active" | "archived" | "deleted";
  commentsEnabled: boolean;
  postLocked: boolean;
  postRemoved: boolean;
  postDeleted: boolean;
}): boolean {
  return input.state === "active" && input.communityStatus === "active" && input.commentsEnabled
    && !input.postLocked && !input.postRemoved && !input.postDeleted;
}

export function canManageDiscussionModerators(role: DiscussionRole): boolean {
  return role === "owner";
}

export function canLeaveDiscussion(role: DiscussionRole, state: DiscussionState): boolean {
  return state === "active" && role !== "owner";
}

export function canTransferDiscussionOwnership(input: {
  actorRole: DiscussionRole;
  targetRole: DiscussionRole;
  targetState: DiscussionState;
  sameUser: boolean;
}): boolean {
  return input.actorRole === "owner" && input.targetState === "active" && !input.sameUser;
}

export function discussionCommentDepth(parentDepth: number | null): number {
  const depth = parentDepth === null ? 0 : parentDepth + 1;
  if (depth > 8) throw new DomainError("comment_depth_exceeded", "Comments can be nested up to eight levels");
  return depth;
}

export function nextVoteValue(current: -1 | 0 | 1, selected: -1 | 1): -1 | 0 | 1 {
  return current === selected ? 0 : selected;
}

export function validateDiscussionPost(input: { type: "text" | "link" | "image"; body?: string | null; linkUrl?: string | null; mediaId?: string | null }): void {
  if (input.type === "text" && !input.body?.trim()) throw new DomainError("body_required", "Text posts require a body");
  if (input.type === "link" && (!input.linkUrl || !input.linkUrl.startsWith("https://"))) throw new DomainError("https_link_required", "Link posts require an HTTPS URL");
  if (input.type === "image" && !input.mediaId) throw new DomainError("media_required", "Image posts require uploaded media");
  if (input.type !== "link" && input.linkUrl) throw new DomainError("unexpected_link", "Only link posts can include a link");
  if (input.type !== "image" && input.mediaId) throw new DomainError("unexpected_media", "Only image posts can include uploaded media");
}

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "DomainError"; }
}

const organizationRoleRank: Record<OrganizationRole, number> = { member: 0, officer: 1, moderator: 2, administrator: 3, owner: 4 };

export function canManageOrganizationMember(input: { actorRole: OrganizationRole; targetRole: OrganizationRole; nextRole?: OrganizationRole; isSelf: boolean }): boolean {
  if (input.actorRole === "member" || input.actorRole === "officer" || input.actorRole === "moderator" || input.isSelf || input.targetRole === "owner") return false;
  const actorRank = organizationRoleRank[input.actorRole];
  if (organizationRoleRank[input.targetRole] >= actorRank) return false;
  return input.nextRole ? organizationRoleRank[input.nextRole] < actorRank : true;
}

export function canSeeContent(input: { visibility: ContentVisibility; sameCampus: boolean; isFriend: boolean; isMember: boolean; isOwner: boolean; blocked: boolean; networkEnabled: boolean }): boolean {
  if (input.blocked) return false;
  if (input.isOwner) return true;
  if (input.visibility === "private") return false;
  if (input.visibility === "campus_only") return input.sameCampus;
  if (input.visibility === "network") return input.networkEnabled;
  if (input.visibility === "friends") return input.isFriend;
  return input.isMember;
}

export function canTransitionFriendRequest(input: { status: string; action: "accept" | "decline" | "cancel" | "remove"; isRequester: boolean; isRecipient: boolean; blocked: boolean }): boolean {
  if (input.blocked) return false;
  if (input.action === "accept" || input.action === "decline") return input.status === "pending" && input.isRecipient;
  if (input.action === "cancel") return input.status === "pending" && input.isRequester;
  return input.status === "accepted" && (input.isRequester || input.isRecipient);
}
