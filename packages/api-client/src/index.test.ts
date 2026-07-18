import { describe, expect, it, vi } from "vitest";
import { CampusExchangeApiClient, CampusExchangeApiError } from "./index";

describe("typed API client", () => {
  it("sends same-origin credentials and JSON mutation headers", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ data: { id: "friend" } }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const client = new CampusExchangeApiClient({ baseUrl: "https://campus.test/api/v1", fetch: fetcher });
    await client.post("/friends", { profileId: "friend" }, "00000000-0000-4000-8000-000000000001");
    expect(fetcher).toHaveBeenCalledWith("https://campus.test/api/v1/friends", expect.objectContaining({ credentials: "include", cache: "no-store" }));
    const init = fetcher.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("throws the stable error envelope and invokes unauthorized handling", async () => {
    const unauthorized = vi.fn();
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ error: { code: "unauthorized", message: "Sign in again.", requestId: "request" } }), { status: 401 }));
    const client = new CampusExchangeApiClient({ fetch: fetcher, onUnauthorized: unauthorized });
    await expect(client.get("/profile")).rejects.toEqual(expect.objectContaining<Partial<CampusExchangeApiError>>({ status: 401, code: "unauthorized" }));
    expect(unauthorized).toHaveBeenCalledOnce();
  });
});
