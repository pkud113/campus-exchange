import { describe, expect, it } from "vitest";
import { discussionErrorStatus, mutationOriginStatus, requireBooleanSetting, trustedRequestId } from "./api-rules";

describe("discussion API rules", () => {
  it("rejects cross-origin and untyped mutations", () => {
    const configured = "https://campus-exchange.net";
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" } }), configured)).toBe(403);
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { origin: configured } }), configured)).toBe(400);
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { origin: configured, "content-type": "application/json" } }), configured)).toBeNull();
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { "content-type": "application/json" } }), configured)).toBe(403);
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { "sec-fetch-site": "same-origin", "content-type": "application/json; charset=utf-8" } }), configured)).toBeNull();
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { origin: configured, "content-type": "text/plain; application/json" } }), configured)).toBe(400);
  });
  it("accepts only server-shaped request identifiers", () => {
    expect(trustedRequestId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(trustedRequestId("attacker-controlled")).toBeNull();
  });
  it("fails closed when a security setting cannot be read", () => {
    expect(requireBooleanSetting({ data: true }, "auth")).toBe(true);
    expect(requireBooleanSetting({ data: false }, "auth")).toBe(false);
    expect(() => requireBooleanSetting({ data: null }, "auth")).toThrow("auth_unavailable");
    expect(() => requireBooleanSetting({ data: true, error: new Error("db") }, "auth")).toThrow("auth_unavailable");
  });
  it.each([["23505",409],["P0002",404],["23514",400],["42501",403],["unknown",500]] as const)("maps database error %s to HTTP %i", (code, status) => {
    expect(discussionErrorStatus(code)).toBe(status);
  });
});
