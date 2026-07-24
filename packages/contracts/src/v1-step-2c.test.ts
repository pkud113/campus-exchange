import { describe, expect, it } from "vitest";
import {
  auditedAdminActionSchema,
  channelReactionInputSchema,
  friendBoxQuerySchema,
  institutionSearchSchema,
  messageRequestBoxQuerySchema,
  notificationPreferenceInputSchema,
  unifiedSearchQuerySchema
} from "./index";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("V1 Step 2C contracts", () => {
  it("uses stable institution IDs and bounded directory cursors", () => {
    expect(institutionSearchSchema.parse({ q: "Michigan", lifecycle: "all", presence: "provisioned", cursor: "ipeds:170976", limit: "50" }))
      .toEqual({ q: "Michigan", lifecycle: "all", presence: "provisioned", cursor: "ipeds:170976", limit: 50 });
    expect(unifiedSearchQuerySchema.parse({ q: "robotics", institution: "ipeds:170976" }).institution).toBe("ipeds:170976");
    expect(unifiedSearchQuerySchema.safeParse({ q: "robotics", institution: uuid }).success).toBe(false);
  });

  it("validates paged friend and request boxes", () => {
    expect(friendBoxQuerySchema.parse({ box: "sent", cursor: uuid })).toMatchObject({ box: "sent", cursor: uuid, limit: 20 });
    expect(messageRequestBoxQuerySchema.parse({ box: "incoming" })).toMatchObject({ box: "incoming", limit: 20 });
  });

  it("keeps reaction and admin action inputs narrow", () => {
    expect(channelReactionInputSchema.parse({ emoji: "👍" })).toEqual({ emoji: "👍" });
    expect(auditedAdminActionSchema.parse({ action: "suspend", targetType: "profile", targetId: uuid, reason: "Verified safety escalation", idempotencyKey: uuid })).toBeTruthy();
    expect(auditedAdminActionSchema.safeParse({ action: "DELETE FROM profiles", targetType: "profile", targetId: uuid, reason: "Verified safety escalation", idempotencyKey: uuid }).success).toBe(false);
  });

  it("normalizes optional notification categories while retaining legacy switches", () => {
    const parsed = notificationPreferenceInputSchema.parse({ quietHoursStart: 22, quietHoursEnd: 7, categories: { message_request: { inApp: true, email: false } } });
    expect(parsed.categories?.message_request).toEqual({ inApp: true, email: false });
  });
});
