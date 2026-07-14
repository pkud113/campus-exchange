import { describe, expect, it } from "vitest";
import { assertListingTransition, canCreateDirectConversationRequest, canManageOwnedContent, canRespondToConversationRequest, canTransitionListing, isVerificationCurrent, normalizeSchoolDomain, purgeAt, validatePassword } from "./index";

describe("listing lifecycle", () => {
  it("allows the intended forward path", () => expect(canTransitionListing("active", "reserved")).toBe(true));
  it("keeps terminal states terminal", () => expect(canTransitionListing("sold", "active")).toBe(false));
  it("requires a buyer for reservation", () => expect(() => assertListingTransition("active", "reserved")).toThrow(/buyer/i));
});

describe("student verification", () => {
  it("normalizes exact domains", () => expect(normalizeSchoolDomain("Student@School.EDU")).toBe("school.edu"));
  it("expires after one year", () => expect(isVerificationCurrent(new Date("2024-01-01"), new Date("2025-01-02"))).toBe(false));
});

describe("account foundation", () => {
  it("requires a twelve-character password", () => expect(() => validatePassword("too-short")).toThrow(/12/));
  it("allows only the recipient to answer a pending request", () => {
    expect(canRespondToConversationRequest("pending", true)).toBe(true);
    expect(canRespondToConversationRequest("accepted", true)).toBe(false);
    expect(canRespondToConversationRequest("pending", false)).toBe(false);
  });
  it("purges soft-deleted content after thirty days", () => expect(purgeAt(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-31T00:00:00.000Z"));
  it("rejects self, blocked, duplicate, and cross-campus direct requests", () => {
    const valid={requesterId:"a",recipientId:"b",sameCampus:true,blocked:false,pendingExists:false,conversationExists:false};
    expect(canCreateDirectConversationRequest(valid)).toBe(true);
    expect(canCreateDirectConversationRequest({...valid,recipientId:"a"})).toBe(false);
    expect(canCreateDirectConversationRequest({...valid,blocked:true})).toBe(false);
    expect(canCreateDirectConversationRequest({...valid,pendingExists:true})).toBe(false);
    expect(canCreateDirectConversationRequest({...valid,conversationExists:true})).toBe(false);
    expect(canCreateDirectConversationRequest({...valid,sameCampus:false})).toBe(false);
  });
  it("requires MFA when staff manage another member's content",()=>{
    expect(canManageOwnedContent("owner","owner",false,false)).toBe(true);
    expect(canManageOwnedContent("staff","owner",true,true)).toBe(true);
    expect(canManageOwnedContent("staff","owner",true,false)).toBe(false);
  });
});
