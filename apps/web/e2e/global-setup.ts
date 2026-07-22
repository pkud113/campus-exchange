import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type Session } from "@supabase/supabase-js";
import { e2eOrganization, personaKeys, personas, personaStorageState, type PersonaKey } from "./personas";

const password = "CampusExchange-Local-E2E-2026!";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated Playwright coverage.`);
  return value;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string) {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 15;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

function cookieState(url: string, session: Session) {
  const hostname = new URL(url).hostname;
  const storageKey = `sb-${hostname.split(".")[0]}-auth-token`;
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return {
    cookies: [{ name: storageKey, value: `base64-${encoded}`, domain: hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }],
    origins: [],
  };
}

async function authenticatedSession(url: string, publishableKey: string, persona: PersonaKey, existingState: boolean): Promise<Session | null> {
  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email: personas[persona].email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error(`Unable to sign in ${persona}.`);
  if (!personas[persona].staff) return signedIn.data.session;
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  if (factors.data.all.some((factor) => factor.status === "verified")) {
    if (existingState) return null;
    throw new Error(`${persona} has a verified local MFA factor but no reusable storage state; reset the local Supabase database.`);
  }
  for (const factor of factors.data.all.filter((factor) => factor.status !== "verified")) {
    const removed = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (removed.error) throw removed.error;
  }
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `Playwright ${persona}` });
  if (enrolled.error) throw enrolled.error;
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret) });
  if (verified.error) throw verified.error;
  const session = await client.auth.getSession();
  if (session.error || !session.data.session) throw session.error ?? new Error(`Unable to establish AAL2 for ${persona}.`);
  return session.data.session;
}

export default async function globalSetup() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = required("SUPABASE_SECRET_KEY");
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Authenticated E2E seeding is restricted to local Supabase instances.");

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: campuses, error: campusesError } = await admin.from("institution_directory").select("campus_id,name").in("name", ["Michigan State University", "University of Illinois Urbana-Champaign"]);
  if (campusesError) throw campusesError;
  const campusA = campuses?.find((campus) => campus.name === "Michigan State University")?.campus_id;
  const campusB = campuses?.find((campus) => campus.name === "University of Illinois Urbana-Champaign")?.campus_id;
  if (!campusA || !campusB) throw new Error("Required Campus A and Campus B fixtures are unavailable.");

  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existing.error) throw existing.error;
  const profileIds = {} as Record<PersonaKey, string>;
  for (const key of personaKeys) {
    const found = existing.data.users.find((candidate) => candidate.email === personas[key].email);
    if (found) {
      profileIds[key] = found.id;
    } else {
      const created = await admin.auth.admin.createUser({ email: personas[key].email, password, email_confirm: true });
      if (created.error || !created.data.user) throw created.error ?? new Error(`Unable to create ${key}.`);
      profileIds[key] = created.data.user.id;
    }
  }

  const organizationId = randomUUID();
  const reportId = randomUUID();
  const fixtureIds = personaKeys.map((key) => `'${profileIds[key]}'`).join(",");
  const profilesSql = personaKeys.map((key) => `update public.profiles set campus_id='${personas[key].campus === "a" ? campusA : campusB}',handle='${personas[key].handle}',display_name='${personas[key].displayName}',bio='${personas[key].displayName} authenticated browser fixture.',status='active',account_kind='${personas[key].staff ? "staff" : "student"}',onboarding_completed_at=now(),password_setup_required=false,verified_at=now(),verified_until=now()+interval '1 year',profile_visibility='network',organization_membership_visibility='network',activity_visibility='network' where id='${profileIds[key]}';`).join("\n");
  const lowFriend = profileIds.studentA < profileIds.studentB ? profileIds.studentA : profileIds.studentB;
  const highFriend = profileIds.studentA < profileIds.studentB ? profileIds.studentB : profileIds.studentA;
  const sql = `
begin;
delete from public.organizations where slug='${e2eOrganization.slug}';
delete from public.moderation_cases where report_id in (select id from public.reports where reporter_id in (${fixtureIds}));
delete from public.reports where reporter_id in (${fixtureIds});
delete from public.conversation_requests where requester_id in (${fixtureIds}) or recipient_id in (${fixtureIds});
delete from public.friend_relationships where profile_low_id in (${fixtureIds}) or profile_high_id in (${fixtureIds});
delete from public.social_posts where author_profile_id in (${fixtureIds});
delete from public.platform_role_assignments where profile_id in (${fixtureIds});
delete from public.role_assignments where profile_id in (${fixtureIds});
${profilesSql}
insert into public.role_assignments(profile_id,campus_id,role,granted_by) values
('${profileIds.studentA}','${campusA}','student',null),('${profileIds.studentB}','${campusA}','student',null),('${profileIds.studentC}','${campusB}','student',null),
('${profileIds.organizationOwner}','${campusA}','student',null),('${profileIds.organizationAdministrator}','${campusA}','student',null),('${profileIds.organizationModerator}','${campusA}','student',null),('${profileIds.organizationOfficer}','${campusA}','student',null),('${profileIds.organizationMember}','${campusA}','student',null),('${profileIds.unauthorizedNonmember}','${campusA}','student',null),
('${profileIds.campusModerator}','${campusA}','moderator','${profileIds.platformAdministrator}'),('${profileIds.platformModerator}','${campusB}','student',null),('${profileIds.platformAdministrator}','${campusB}','student',null);
insert into public.platform_role_assignments(profile_id,role,granted_by) values ('${profileIds.platformModerator}','moderator','${profileIds.platformAdministrator}'),('${profileIds.platformAdministrator}','admin','${profileIds.platformAdministrator}');
insert into public.organizations(id,campus_id,created_by,slug,name,description,visibility,membership_policy,status,member_count,idempotency_key) values ('${organizationId}','${campusA}','${profileIds.organizationOwner}','${e2eOrganization.slug}','${e2eOrganization.name}','Authenticated product-alignment workspace for browser release gates.','network','open','active',5,'${randomUUID()}');
insert into public.organization_memberships(organization_id,profile_id,campus_id,role,status,joined_at) values
('${organizationId}','${profileIds.organizationOwner}','${campusA}','owner','active',now()),('${organizationId}','${profileIds.organizationAdministrator}','${campusA}','administrator','active',now()),('${organizationId}','${profileIds.organizationModerator}','${campusA}','moderator','active',now()),('${organizationId}','${profileIds.organizationOfficer}','${campusA}','officer','active',now()),('${organizationId}','${profileIds.organizationMember}','${campusA}','member','active',now());
with category as (insert into public.organization_categories(organization_id,name,sort_position,created_by) values('${organizationId}','LEADERSHIP',20,'${profileIds.organizationOwner}') returning id), channel as (insert into public.organization_channels(organization_id,category_id,name,description,channel_type,visibility,sort_position,created_by) select '${organizationId}',id,'officer-room','Officer-only planning','text','restricted',0,'${profileIds.organizationOwner}' from category returning id) insert into public.organization_channel_role_overrides(channel_id,role_id,view_channel,send_messages,updated_by) select channel.id,role.id,true,true,'${profileIds.organizationOwner}' from channel cross join public.organization_roles role where role.organization_id='${organizationId}' and role.builtin_key='officer';
insert into public.social_posts(campus_id,author_profile_id,body,visibility,status,idempotency_key) values('${campusA}','${profileIds.studentA}','Authenticated profile gallery fixture','network','active','${randomUUID()}');
insert into public.friend_relationships(profile_low_id,profile_high_id,requested_by,status) values('${lowFriend}','${highFriend}','${profileIds.studentA}','pending');
insert into public.reports(id,campus_id,subject_campus_id,reporter_id,target_type,target_id,reason,details,status,platform_visible,idempotency_key) values('${reportId}','${campusA}','${campusA}','${profileIds.studentA}','profile','${profileIds.studentB}','harassment','Authenticated moderation and appeal browser fixture.','open',true,'${randomUUID()}');
update public.moderation_cases set status='appealed',user_visible_resolution='A warning was issued after review.',resolved_at=now() where report_id='${reportId}';
insert into public.moderation_appeals(case_id,appellant_id,statement,status,idempotency_key) select id,'${profileIds.studentB}','The reported interaction was misunderstood and should be reviewed again.','open','${randomUUID()}' from public.moderation_cases where report_id='${reportId}';
commit;`;
  execFileSync("docker", ["exec", "-i", "supabase_db_campus-exchange", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "inherit", "inherit"] });

  await mkdir(path.dirname(personaStorageState("studentA")), { recursive: true });
  for (const key of personaKeys) {
    const statePath = personaStorageState(key);
    const session = await authenticatedSession(url, publishableKey, key, existsSync(statePath));
    if (session) await writeFile(statePath, JSON.stringify(cookieState(url, session)), "utf8");
  }
}
