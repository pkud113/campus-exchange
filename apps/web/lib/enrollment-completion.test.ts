import { describe, expect, it, vi } from "vitest";
import {
  completePendingRegistrationEnrollment,
  registrationGrantIdFromMetadata,
} from "./enrollment-completion";

const grantId = "c2000000-0000-4000-8000-000000000010";

describe("registration enrollment completion", () => {
  it("accepts only an opaque UUID from auth metadata", () => {
    expect(registrationGrantIdFromMetadata({ registrationGrantId: grantId })).toBe(grantId);
    expect(registrationGrantIdFromMetadata({ registrationGrantId: "forged" })).toBeNull();
    expect(registrationGrantIdFromMetadata(null)).toBeNull();
  });

  it("consumes a pending universal grant through the trusted RPC", async () => {
    const completeEnrollment = vi.fn(async () => ({ error: null }));
    await expect(
      completePendingRegistrationEnrollment(completeEnrollment, { registrationGrantId: grantId }, false)
    ).resolves.toEqual({ attempted: true, completed: true });
    expect(completeEnrollment).toHaveBeenCalledWith(grantId);
  });

  it("does not let grant metadata override an existing reviewed-domain profile", async () => {
    const completeEnrollment = vi.fn(async () => ({ error: null }));
    await expect(
      completePendingRegistrationEnrollment(completeEnrollment, { registrationGrantId: grantId }, true)
    ).resolves.toEqual({ attempted: false, completed: true });
    expect(completeEnrollment).not.toHaveBeenCalled();
  });

  it("fails closed when the trusted grant consumption RPC rejects", async () => {
    const completeEnrollment = vi.fn(async () => ({ error: { message: "invalid or expired enrollment grant" } }));
    await expect(
      completePendingRegistrationEnrollment(completeEnrollment, { registrationGrantId: grantId }, false)
    ).resolves.toEqual({ attempted: true, completed: false });
  });
});
