import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const normalized = identifier.trim().toLowerCase();
  if (normalized.includes("@")) return normalized;
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("handle", normalized).eq("status", "active").maybeSingle();
  if (!profile) return null;
  const { data, error } = await admin.auth.admin.getUserById(profile.id);
  return error ? null : data.user.email ?? null;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
