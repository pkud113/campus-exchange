import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const PUBLIC_CACHE_PATHS = new Set(["/safety", "/manifest.webmanifest", "/api/openapi.json"]);

function securityHeaders(response: NextResponse, requestId: string, pathname: string) {
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests");
  if (!PUBLIC_CACHE_PATHS.has(pathname)) response.headers.set("cache-control", "private, no-store");
  return response;
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host")?.split(":", 1)[0]?.toLowerCase() ?? request.nextUrl.hostname;
  if (hostname === "www.campus-exchange.net") {
    const canonical = request.nextUrl.clone();
    canonical.hostname = "campus-exchange.net";
    canonical.protocol = "https:";
    canonical.port = "";
    return securityHeaders(NextResponse.redirect(canonical, 308), request.headers.get("x-request-id") ?? crypto.randomUUID(), request.nextUrl.pathname);
  }
  const id = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", id);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items: Array<{name:string;value:string;options?:CookieOptions}>) => {
          for (const item of items) request.cookies.set(item.name, item.value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const item of items) item.options ? response.cookies.set(item.name, item.value, item.options as never) : response.cookies.set(item.name, item.value);
        }
      }
    });
    await supabase.auth.getUser();
  }
  return securityHeaders(response, id, request.nextUrl.pathname);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"] };
