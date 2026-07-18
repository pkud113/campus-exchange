import type { ApiErrorBody } from "@campus-exchange/shared-types";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class CampusExchangeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string | null,
    public readonly fieldErrors?: ApiErrorBody["error"]["fieldErrors"],
  ) {
    super(message);
    this.name = "CampusExchangeApiError";
  }
}

export type ApiClientOptions = {
  baseUrl?: string;
  fetch?: FetchLike;
  getAccessToken?: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void | Promise<void>;
};

export class CampusExchangeApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(private readonly options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api/v1").replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get<ResponseBody>(path: string, signal?: AbortSignal): Promise<ResponseBody> {
    return this.request<ResponseBody>(path, { method: "GET", ...(signal ? { signal } : {}) });
  }

  post<ResponseBody, Body = unknown>(path: string, body: Body, requestId?: string): Promise<ResponseBody> {
    return this.mutation<ResponseBody, Body>("POST", path, body, requestId);
  }

  patch<ResponseBody, Body = unknown>(path: string, body: Body, requestId?: string): Promise<ResponseBody> {
    return this.mutation<ResponseBody, Body>("PATCH", path, body, requestId);
  }

  delete<ResponseBody>(path: string, requestId?: string): Promise<ResponseBody> {
    return this.request<ResponseBody>(path, { method: "DELETE", ...(requestId ? { headers: { "X-Request-Id": requestId } } : {}) });
  }

  private mutation<ResponseBody, Body>(method: "POST" | "PATCH", path: string, body: Body, requestId?: string): Promise<ResponseBody> {
    return this.request<ResponseBody>(path, {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...(requestId ? { "X-Request-Id": requestId } : {}) },
    });
  }

  private async request<ResponseBody>(path: string, init: RequestInit): Promise<ResponseBody> {
    const token = await this.options.getAccessToken?.();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await this.fetcher(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`, { ...init, headers, credentials: "include", cache: "no-store" });
    if (response.status === 204) return undefined as ResponseBody;
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) await this.options.onUnauthorized?.();
      const candidate = body as Partial<ApiErrorBody> | null;
      const error = candidate?.error;
      throw new CampusExchangeApiError(response.status, error?.code ?? "request_failed", error?.message ?? "Campus Exchange could not complete the request.", error?.requestId ?? response.headers.get("x-request-id"), error?.fieldErrors);
    }
    return body as ResponseBody;
  }
}
