import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
const email = String(args.email ?? "").trim().toLowerCase();
const campusSlug = String(args.campus ?? "msu").trim().toLowerCase();
const role = String(args.role ?? "admin").trim().toLowerCase();
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret || !email.includes("@") || !["moderator", "admin"].includes(role)) {
  console.error("Usage: pnpm admin:invite -- --email staff@example.com --campus msu --role admin");
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in the operator environment.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: campus, error: campusError } = await admin.from("campuses").select("id,name").eq("slug", campusSlug).single();
if (campusError || !campus) throw new Error(`Campus '${campusSlug}' was not found.`);
const emailHash = createHash("sha256").update(email).digest("hex");
const { data: invitation, error: inviteError } = await admin.from("staff_invitations").upsert({ email_hash: emailHash, campus_id: campus.id, role, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), claimed_at: null }, { onConflict: "email_hash" }).select("id").single();
if (inviteError) throw inviteError;
const temporaryPassword = randomBytes(36).toString("base64url");
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
if (createError) {
  await admin.from("staff_invitations").delete().eq("id", invitation.id).is("claimed_at", null);
  throw createError;
}
if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_ORIGIN) {
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: "Your Campus Exchange staff account", html: `<p>You have been invited to moderate ${campus.name} on Campus Exchange.</p><p>Visit <a href="${process.env.APP_ORIGIN}/register">${process.env.APP_ORIGIN}/register</a>, enter this email address, and request a one-time setup code.</p><p>Multi-factor authentication is required before moderation tools become available.</p>` }) });
}
console.log(`Created ${role} account ${created.user.id} for campus ${campusSlug}.`);
console.log(`The recipient should visit ${process.env.APP_ORIGIN ?? "https://campus-exchange.net"}/register and request a setup code.`);
