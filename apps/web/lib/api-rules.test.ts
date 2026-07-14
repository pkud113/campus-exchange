import { describe, expect, it } from "vitest";
import { discussionErrorStatus, mutationOriginStatus } from "./api-rules";

describe("discussion API rules", () => {
  it("rejects cross-origin and untyped mutations", () => {
    const configured = "https://campus-exchange.net";
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" } }), configured)).toBe(403);
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { origin: configured } }), configured)).toBe(400);
    expect(mutationOriginStatus(new Request(`${configured}/api/v1/discussions/communities`, { method: "POST", headers: { origin: configured, "content-type": "application/json" } }), configured)).toBeNull();
  });
  it.each([["23505",409],["P0002",404],["23514",400],["42501",403],["unknown",500]] as const)("maps database error %s to HTTP %i", (code, status) => {
    expect(discussionErrorStatus(code)).toBe(status);
  });
});
