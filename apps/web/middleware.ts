import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host")?.split(":", 1)[0]?.toLowerCase() ?? request.nextUrl.hostname;
  if (hostname === "www.campus-exchange.net") {
    const canonical = request.nextUrl.clone();
    canonical.hostname = "campus-exchange.net";
    canonical.protocol = "https:";
    canonical.port = "";
    return NextResponse.redirect(canonical, 308);
  }
  const response = NextResponse.next();
  const id = request.headers.get("x-request-id") ?? crypto.randomUUID();
  response.headers.set("x-request-id", id);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"] };
