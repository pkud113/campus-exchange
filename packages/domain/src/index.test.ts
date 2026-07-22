import { describe, expect, it } from "vitest";
import { assertListingTransition, canCommentInDiscussion, canCreateDirectConversationRequest, canLeaveDiscussion, canManageDiscussionModerators, canManageOrganizationMember, canManageOwnedContent, canModerateDiscussion, canPostInDiscussion, canRespondToConversationRequest, canSeeContent, canTransferDiscussionOwnership, canTransitionFriendRequest, canTransitionListing, decideInstitutionRegistration, discussionCommentDepth, isValidDiscussionSlug, isVerificationCurrent, nextVoteValue, normalizeSchoolDomain, purgeAt, registrationOutcomeMessages, validateDiscussionPost, validatePassword } from "./index";

describe("listing lifecycle", () => {
  it("allows the intended forward path", () => expect(canTransitionListing("active", "reserved")).toBe(true));
  it("keeps terminal states terminal", () => expect(canTransitionListing("sold", "active")).toBe(false));
  it("requires a buyer for reservation", () => expect(() => assertListingTransition("active", "reserved")).toThrow(/buyer/i));
});

describe("V1 relationship and visibility rules", () => {
  it("prevents organization role escalation and owner management", () => {
    expect(canManageOrganizationMember({ actorRole: "administrator", targetRole: "member", nextRole: "officer", isSelf: false })).toBe(true);
    expect(canManageOrganizationMember({ actorRole: "administrator", targetRole: "member", nextRole: "owner", isSelf: false })).toBe(false);
    expect(canManageOrganizationMember({ actorRole: "owner", targetRole: "owner", isSelf: false })).toBe(false);
  });

  it("gives blocks precedence over every content visibility", () => {
    expect(canSeeContent({ visibility: "network", sameCampus: true, isFriend: true, isMember: true, isOwner: false, blocked: true, networkEnabled: true })).toBe(false);
    expect(canSeeContent({ visibility: "friends", sameCampus: false, isFriend: true, isMember: false, isOwner: false, blocked: false, networkEnabled: true })).toBe(true);
  });

  it("keeps friend request actions actor-specific", () => {
    expect(canTransitionFriendRequest({ status: "pending", action: "accept", isRequester: false, isRecipient: true, blocked: false })).toBe(true);
    expect(canTransitionFriendRequest({ status: "pending", action: "accept", isRequester: true, isRecipient: false, blocked: false })).toBe(false);
    expect(canTransitionFriendRequest({ status: "accepted", action: "remove", isRequester: true, isRecipient: false, blocked: false })).toBe(true);
  });
});

describe("discussion rules", () => {
  it("validates immutable community slug syntax", () => {
    expect(isValidDiscussionSlug("campus_life")).toBe(true);
    expect(isValidDiscussionSlug("No-Dashes")).toBe(false);
    expect(isValidDiscussionSlug("ab")).toBe(false);
  });
  it("applies posting permissions and archive state", () => {
    expect(canPostInDiscussion({ role: "member", state: "active", permission: "members", communityStatus: "active" })).toBe(true);
    expect(canPostInDiscussion({ role: "member", state: "active", permission: "moderators", communityStatus: "active" })).toBe(false);
    expect(canPostInDiscussion({ role: "moderator", state: "active", permission: "moderators", communityStatus: "active" })).toBe(true);
    expect(canPostInDiscussion({ role: "owner", state: "active", permission: "members", communityStatus: "archived" })).toBe(false);
  });
  it("keeps moderation and ownership least-privileged", () => {
    expect(canModerateDiscussion("moderator", "active")).toBe(true);
    expect(canModerateDiscussion("member", "active")).toBe(false);
    expect(canManageDiscussionModerators("owner")).toBe(true);
    expect(canManageDiscussionModerators("moderator")).toBe(false);
    expect(canLeaveDiscussion("owner", "active")).toBe(false);
    expect(canLeaveDiscussion("member", "active")).toBe(true);
    expect(canTransferDiscussionOwnership({ actorRole: "owner", targetRole: "member", targetState: "active", sameUser: false })).toBe(true);
    expect(canTransferDiscussionOwnership({ actorRole: "owner", targetRole: "member", targetState: "banned", sameUser: false })).toBe(false);
  });
  it("enforces the eight-level comment limit", () => {
    expect(discussionCommentDepth(null)).toBe(0);
    expect(discussionCommentDepth(7)).toBe(8);
    expect(() => discussionCommentDepth(8)).toThrow(/eight levels/i);
  });
  it("rejects comments on inactive, locked, removed, or deleted targets", () => {
    const open = { state: "active", communityStatus: "active", commentsEnabled: true, postLocked: false, postRemoved: false, postDeleted: false } as const;
    expect(canCommentInDiscussion(open)).toBe(true);
    expect(canCommentInDiscussion({ ...open, state: "banned" })).toBe(false);
    expect(canCommentInDiscussion({ ...open, communityStatus: "archived" })).toBe(false);
    expect(canCommentInDiscussion({ ...open, commentsEnabled: false })).toBe(false);
    expect(canCommentInDiscussion({ ...open, postLocked: true })).toBe(false);
    expect(canCommentInDiscussion({ ...open, postRemoved: true })).toBe(false);
    expect(canCommentInDiscussion({ ...open, postDeleted: true })).toBe(false);
  });
  it("toggles and switches votes", () => {
    expect(nextVoteValue(0, 1)).toBe(1);
    expect(nextVoteValue(1, 1)).toBe(0);
    expect(nextVoteValue(-1, 1)).toBe(1);
  });
  it("validates each discussion post type", () => {
    expect(() => validateDiscussionPost({ type: "text", body: "" })).toThrow(/body/i);
    expect(() => validateDiscussionPost({ type: "link", linkUrl: "http://example.com" })).toThrow(/HTTPS/i);
    expect(() => validateDiscussionPost({ type: "image" })).toThrow(/media/i);
    expect(() => validateDiscussionPost({ type: "text", body: "Hello campus" })).not.toThrow();
    expect(() => validateDiscussionPost({ type: "image", mediaId: "media", body: "Optional image context" })).not.toThrow();
    expect(() => validateDiscussionPost({ type: "link", linkUrl: "https://example.com", body: "Optional link commentary" })).not.toThrow();
    expect(() => validateDiscussionPost({ type: "text", body: "Text", mediaId: "media" })).toThrow(/Only image posts/i);
    expect(() => validateDiscussionPost({ type: "image", mediaId: "media", linkUrl: "https://example.com" })).toThrow(/Only link posts/i);
  });
});

describe("student verification", () => {
  it("normalizes exact domains", () => expect(normalizeSchoolDomain("Student@School.EDU")).toBe("school.edu"));
  it("expires after one year", () => expect(isVerificationCurrent(new Date("2024-01-01"), new Date("2025-01-02"))).toBe(false));
  it("requires the approved domain to match the selected institution campus", () => {
    const base = { staffInvite: false, institutionRegistrationStatus: "open" as const, selectedCampusId: "msu", resolution: "eligible", resolvedCampusId: "msu" };
    expect(decideInstitutionRegistration(base)).toBe("SUPPORTED_AND_OPEN");
    expect(decideInstitutionRegistration({ ...base, selectedCampusId: "purdue" })).toBe("INSTITUTION_DOMAIN_MISMATCH");
    expect(decideInstitutionRegistration({ ...base, resolution: "ambiguous", resolvedCampusId: null })).toBe("AMBIGUOUS_OR_SHARED_DOMAIN");
    expect(decideInstitutionRegistration({ ...base, resolution: "unsupported", resolvedCampusId: null })).toBe("DIRECTORY_LISTED_DOMAIN_REVIEW_REQUIRED");
    expect(decideInstitutionRegistration({ ...base, resolution: "alumni", resolvedCampusId: null })).toBe("ALUMNI_DOMAIN");
    expect(decideInstitutionRegistration({ ...base, resolution: "campus_disabled", resolvedCampusId: null })).toBe("CAMPUS_REGISTRATION_PAUSED");
    expect(decideInstitutionRegistration({ ...base, resolution: "domain_disabled", resolvedCampusId: null })).toBe("DOMAIN_DISABLED");
    expect(decideInstitutionRegistration({ ...base, institutionRegistrationStatus: "suspended" })).toBe("CAMPUS_REGISTRATION_PAUSED");
    expect(decideInstitutionRegistration({ ...base, institutionRegistrationStatus: "closed" })).toBe("INSTITUTION_NOT_SUPPORTED");
  });
  it("keeps exact user-facing copy for every stable registration outcome", () => {
    expect(registrationOutcomeMessages).toEqual({
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
    });
  });
});

describe("account foundation", () => {
  it("requires a twelve-character password", () => expect(() => validatePassword("too-short")).toThrow(/12/));
  it("allows only the recipient to answer a pending request", () => {
    expect(canRespondToConversationRequest("pending", true)).toBe(true);
    expect(canRespondToConversationRequest("accepted", true)).toBe(false);
    expect(canRespondToConversationRequest("pending", false)).toBe(false);
  });
  it("purges soft-deleted content after thirty days", () => expect(purgeAt(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-31T00:00:00.000Z"));
  it("rejects self, blocked, and duplicate requests while honoring the network switch", () => {
    const valid={requesterId:"a",recipientId:"b",sameCampus:true,networkEnabled:true,blocked:false,pendingExists:false,conversationExists:false};
    expect(canCreateDirectConversationRequest(valid)).toBe(true);
    expect(canCreateDirectConversationRequest({...valid,recipientId:"a"})).toBe(false);
    expect(canCreateDirectConversationRequest({...valid,blocked:true})).toBe(false);
    expect(canCreateDirectConversationRequest({...valid,pendingExists:true})).toBe(false);
    expect(canCreateDirectConversationRequest({...valid,conversationExists:true})).toBe(false);
    expect(canCreateDirectConversationRequest({...valid,sameCampus:false})).toBe(true);
    expect(canCreateDirectConversationRequest({...valid,sameCampus:false,networkEnabled:false})).toBe(false);
  });
  it("requires MFA when staff manage another member's content",()=>{
    expect(canManageOwnedContent("owner","owner",false,false)).toBe(true);
    expect(canManageOwnedContent("staff","owner",true,true)).toBe(true);
    expect(canManageOwnedContent("staff","owner",true,false)).toBe(false);
  });
});
