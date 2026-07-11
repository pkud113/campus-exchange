"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | undefined;
export function createSupabaseBrowserClient() {
  const parsed = getPublicEnv();
  if (!parsed.success) throw new Error("Campus Exchange is not connected to Supabase yet.");
  client ??= createBrowserClient(parsed.data.NEXT_PUBLIC_SUPABASE_URL, parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return client;
}
