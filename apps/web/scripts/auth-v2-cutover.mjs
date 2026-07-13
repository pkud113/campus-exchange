import { createClient } from "@supabase/supabase-js";

const enable = process.argv.includes("--enable");
const disable = process.argv.includes("--disable");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret || enable === disable) {
  console.error("Usage: pnpm auth:v2 -- --enable  (or --disable for rollback)");
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in the operator environment.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await admin.from("runtime_settings").upsert({ key: "auth_v2_enforced", value: enable, updated_at: new Date().toISOString() });
if (error) throw error;
console.log(`Authentication v2 enforcement is now ${enable ? "ENABLED" : "DISABLED"}.`);
if (enable) console.log("Existing passwordless accounts must verify once at /register and establish a password.");
