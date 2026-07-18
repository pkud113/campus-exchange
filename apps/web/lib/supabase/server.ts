import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const parsed = getPublicEnv();
  if (!parsed.success) throw new Error("service_unconfigured");
  const store = await cookies();
  return createServerClient(parsed.data.NEXT_PUBLIC_SUPABASE_URL, parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items: Array<{ name: string; value: string; options?: CookieOptions }>) => {
        try { for (const item of items) { if (item.options) store.set(item.name, item.value, item.options as never); else store.set(item.name, item.value); } } catch { /* Server components cannot set cookies. */ }
      }
    }
  });
}

export function createSupabaseAdminClient() {
  const parsed = getPublicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!parsed.success || !secret) throw new Error("service_unconfigured");
  return createClient(parsed.data.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
