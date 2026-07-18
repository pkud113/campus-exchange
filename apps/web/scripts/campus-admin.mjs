import { createClient } from "@supabase/supabase-js";

const tokens = process.argv.slice(2);
const args = {};
for (let i = 0; i < tokens.length; i += 1) {
  if (!tokens[i]?.startsWith("--")) continue;
  const key = tokens[i].slice(2);
  const next = tokens[i + 1];
  if (next && !next.startsWith("--")) { args[key] = next; i += 1; } else args[key] = true;
}
const command = String(tokens.find((token) => !token.startsWith("--")) ?? "list");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) { console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in the operator environment."); process.exit(1); }
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = args.apply === true;
const slug = String(args.campus ?? args.slug ?? "").trim().toLowerCase();

async function campus() {
  const { data, error } = await db.from("campuses").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Campus '${slug}' was not found.`);
  return data;
}
async function audit(campusId, action, target, metadata = {}) {
  const targetTypes = { request: "school_request", "domain-request": "institution_domain_request", institution: "institution_directory" };
  const { error } = await db.from("directory_operator_audit").insert({ campus_id: campusId ?? null, action, target_type: targetTypes[command] ?? "campus_directory", target_id: target, metadata: { operatorCommand: command, ...metadata } });
  if (error) throw error;
}
async function preview(label, payload, mutation) {
  console.log(`${apply ? "APPLY" : "PREVIEW"}: ${label}`);
  console.log(JSON.stringify(payload, null, 2));
  if (!apply) { console.log("Re-run with --apply after reviewing this preview."); return; }
  await mutation();
  console.log("Applied. Read back with: pnpm campus:admin -- list");
}
function exactDomain() {
  const domain = String(args.domain ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) || !domain.includes(".")) throw new Error("Provide an exact valid domain without @ or wildcards.");
  return domain;
}
function sourceUrl() {
  const value = String(args["source-url"] ?? "").trim();
  if (!/^https:\/\/\S+$/.test(value)) throw new Error("Reviewed mappings require an official HTTPS --source-url.");
  return value;
}
function reviewer() {
  const value = String(args.reviewer ?? "").trim();
  if (value.length < 2 || value.length > 160) throw new Error("Provide a stable operator identifier with --reviewer (2-160 characters; do not use a private student email).");
  return value;
}
function confidence() {
  const value = String(args.confidence ?? "high");
  if (!["low", "medium", "high"].includes(value)) throw new Error("Choose --confidence low, medium, or high.");
  return value;
}

if (command === "list") {
  const { data, error } = await db.from("campuses").select("id,name,short_name,slug,city,region,country_code,timezone,status,campus_email_domains(domain,is_enabled,review_status,domain_kind,source_url,reviewed_at,review_notes)").order("name");
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
} else if (command === "upsert") {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) || !args.name) throw new Error("Usage: campus:admin -- upsert --campus campus-alpha --name 'Campus Alpha' [--short-name Alpha --timezone America/Chicago --city Testville --region TS] [--apply]");
  const { data: existing, error: existingError } = await db.from("campuses").select("id,status").eq("slug", slug).maybeSingle();
  if (existingError) throw existingError;
  if (existing && existing.status !== "disabled") throw new Error("Refusing to modify an enabled or suspended campus with upsert. Change lifecycle state explicitly first.");
  const payload = { slug, name: String(args.name), short_name: String(args["short-name"] ?? args.name), timezone: String(args.timezone ?? "America/Chicago"), city: args.city ? String(args.city) : null, region: args.region ? String(args.region) : null, country_code: String(args.country ?? "US").toUpperCase(), status: "disabled" };
  await preview(`create or update inactive campus ${slug}`, payload, async () => {
    const { data, error } = await db.from("campuses").upsert(payload, { onConflict: "slug" }).select("id").single(); if (error) throw error;
    await audit(data.id, "campus.operator_upsert", slug, { status: "disabled" });
  });
} else if (command === "status") {
  const target = await campus();
  const status = String(args.status ?? "");
  if (!["enabled", "suspended", "disabled"].includes(status)) throw new Error("Choose --status enabled, suspended, or disabled.");
  if (status === "enabled") {
    const { count } = await db.from("campus_email_domains").select("domain", { count: "exact", head: true }).eq("campus_id", target.id).eq("is_enabled", true).eq("review_status", "reviewed").in("domain_kind", ["student", "institutional"]);
    if (!count) throw new Error("A campus needs at least one reviewed, qualifying, enabled domain before activation.");
  }
  await preview(`set ${slug} status to ${status}`, { before: target.status, after: status }, async () => {
    const { error } = await db.from("campuses").update({ status }).eq("id", target.id); if (error) throw error;
    await audit(target.id, "campus.operator_status", slug, { before: target.status, after: status });
  });
} else if (command === "domain") {
  const target = await campus();
  const domain = exactDomain();
  const action = String(args.action ?? "add");
  if (!["add", "review", "reject", "enable", "disable", "remove"].includes(action)) throw new Error("Choose --action add, review, reject, enable, disable, or remove.");
  const { data: existing, error: existingError } = await db.from("campus_email_domains").select("*").eq("campus_id", target.id).eq("domain", domain).maybeSingle();
  if (existingError) throw existingError;
  if (action === "add" && existing) throw new Error("That mapping already exists. Review, enable, disable, reject, or remove the existing row explicitly.");
  if (["review", "reject", "enable", "disable", "remove"].includes(action) && !existing) throw new Error("That mapping does not exist. Add it as unreviewed first.");
  if (["disable", "remove"].includes(action) && existing?.is_enabled) {
    const { data } = await db.from("campus_email_domains").select("domain").eq("campus_id", target.id).eq("is_enabled", true).neq("domain", domain);
    if (!data?.length && args["confirm-last-domain"] !== true) throw new Error("Refusing to remove or disable the last enabled domain. Add --confirm-last-domain after reviewing registration impact.");
  }
  let payload;
  if (action === "add") payload = { campus_id: target.id, domain, is_enabled: false, review_status: "unreviewed", domain_kind: "other", source_url: null, reviewed_at: null, review_notes: String(args.notes ?? "") || null, institution_id: args.institution ? String(args.institution) : null };
  if (action === "review") {
    const kind = String(args.kind ?? "");
    if (!["student", "institutional", "shared", "alumni"].includes(kind)) throw new Error("Review requires --kind student, institutional, shared, or alumni.");
    payload = { is_enabled: false, review_status: kind === "shared" ? "ambiguous" : "reviewed", domain_kind: kind, source_url: sourceUrl(), source_label: "Operator-reviewed official source", reviewed_at: new Date().toISOString(), review_notes: String(args.notes ?? "") || null, reviewed_by: reviewer(), review_confidence: confidence(), institution_id: args.institution ? String(args.institution) : existing?.institution_id ?? null };
  }
  if (action === "reject") payload = { is_enabled: false, review_status: "rejected", source_url: args["source-url"] ? sourceUrl() : existing?.source_url ?? null, reviewed_at: new Date().toISOString(), review_notes: String(args.notes ?? "Rejected by operator review"), reviewed_by: reviewer(), review_confidence: confidence() };
  if (action === "enable") {
    if (existing.review_status !== "reviewed" || !["student", "institutional"].includes(existing.domain_kind) || !existing.source_url) throw new Error("Only a reviewed student/institutional mapping with an official source can be enabled.");
    const { data: collision } = await db.from("campus_email_domains").select("campus_id").eq("domain", domain).eq("is_enabled", true).neq("campus_id", target.id);
    if (collision?.length) throw new Error("Another campus already has this exact domain enabled. Resolve the shared-domain ambiguity first.");
    payload = { is_enabled: true };
  }
  if (action === "disable") payload = { is_enabled: false };
  await preview(`${action} domain ${domain} for ${slug}`, { campus: slug, domain, action, changes: payload ?? null }, async () => {
    let error;
    if (action === "remove") ({ error } = await db.from("campus_email_domains").delete().eq("campus_id", target.id).eq("domain", domain));
    else if (action === "add") ({ error } = await db.from("campus_email_domains").upsert(payload, { onConflict: "campus_id,domain" }));
    else ({ error } = await db.from("campus_email_domains").update(payload).eq("campus_id", target.id).eq("domain", domain));
    if (error) throw error;
    await audit(target.id, `campus_domain.operator_${action}`, `${slug}:${domain}`, { domain, action });
  });
} else if (command === "institutions") {
  const query = String(args.query ?? args.q ?? "").trim();
  const { data, error } = await db.rpc("search_institution_directory", { search_query: query, result_limit: 50 });
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
} else if (command === "institution") {
  const id = String(args.id ?? args.institution ?? "");
  const action = String(args.action ?? "status");
  if (!/^ipeds:[0-9]{6}$/.test(id) || !["status", "link", "merge", "duplicate"].includes(action)) throw new Error("Usage: institution --id ipeds:123456 --action status|link|merge|duplicate [--registration-status open|suspended|closed --directory-status active|inactive|closed|merged|renamed|duplicate --campus slug --into ipeds:654321] [--apply]");
  const { data: row, error } = await db.from("institution_directory").select("*").eq("id", id).single(); if (error) throw error;
  if (action === "status") {
    const reviewedBy = reviewer();
    const registrationStatus = String(args["registration-status"] ?? row.registration_status);
    const directoryStatus = String(args["directory-status"] ?? row.status);
    if (!["open", "suspended", "closed"].includes(registrationStatus) || !["active", "inactive", "closed", "merged", "renamed", "duplicate"].includes(directoryStatus)) throw new Error("Invalid registration or directory status.");
    await preview(`update institution ${id}`, { before: { registrationStatus: row.registration_status, status: row.status }, after: { registrationStatus, status: directoryStatus } }, async () => {
      const { error: updateError } = await db.from("institution_directory").update({ registration_status: registrationStatus, status: directoryStatus, updated_at: new Date().toISOString() }).eq("id", id); if (updateError) throw updateError;
      await audit(row.campus_id, "institution.operator_status", id, { registrationStatus, directoryStatus, reviewer: reviewedBy });
    });
  } else if (action === "link") {
    const reviewedBy = reviewer();
    const target = await campus();
    if (row.campus_id && row.campus_id !== target.id) throw new Error("This institution is already linked to another campus. Resolve or merge it explicitly.");
    const { data: collision } = await db.from("institution_directory").select("id,name").eq("campus_id", target.id).neq("id", id);
    if (collision?.length) throw new Error(`Campus '${slug}' is already linked to ${collision[0].id}.`);
    await preview(`link institution ${id} to ${slug}`, { institution: row.name, campus: slug }, async () => {
      const { error: updateError } = await db.from("institution_directory").update({ campus_id: target.id, updated_at: new Date().toISOString() }).eq("id", id); if (updateError) throw updateError;
      await audit(target.id, "institution.operator_link", id, { reviewer: reviewedBy });
    });
  } else {
    const reviewedBy = reviewer();
    const into = String(args.into ?? "");
    if (!/^ipeds:[0-9]{6}$/.test(into) || into === id) throw new Error("Merge/duplicate requires a different --into ipeds:UNITID target.");
    const { data: target, error: targetError } = await db.from("institution_directory").select("*").eq("id", into).single(); if (targetError) throw targetError;
    if (row.campus_id && target.campus_id && row.campus_id !== target.campus_id) throw new Error("Both records link different campuses; resolve campus ownership before merging.");
    await preview(`${action} institution ${id} into ${into}`, { source: row.name, target: target.name, retainedCampusId: target.campus_id ?? row.campus_id ?? null }, async () => {
      const { error: mergeError } = await db.rpc("merge_institution_directory", { source_institution_id: id, target_institution_id: into, merge_status: action === "duplicate" ? "duplicate" : "merged", input_reviewer: reviewedBy });
      if (mergeError) throw mergeError;
    });
  }
} else if (command === "domain-requests") {
  let query = db.from("institution_domain_requests").select("id,institution_id,email_domain,status,verification_count,first_verified_at,last_verified_at,reviewed_by,review_confidence,evidence_url,reviewed_at,resolution_campus_id,operator_notes,institution_directory(name,city,region,status,registration_status,campus_id)").order("last_verified_at", { ascending: false }).limit(200);
  if (args.status) query = query.eq("status", String(args.status));
  if (args.institution) query = query.eq("institution_id", String(args.institution));
  const { data, error } = await query; if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
} else if (command === "domain-request") {
  const id = String(args.id ?? "");
  const action = String(args.action ?? "review");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["review", "approve", "reject", "duplicate"].includes(action)) throw new Error("Usage: domain-request --id <uuid> --action review|approve|reject|duplicate [--campus slug --kind student|institutional --source-url https://... --reviewer operator-id --confidence high --enable-domain] [--apply]");
  const { data: requestRow, error } = await db.from("institution_domain_requests").select("*,institution_directory(name,campus_id,registration_status)").eq("id", id).single(); if (error) throw error;
  const reviewedBy = reviewer();
  const reviewConfidence = confidence();
  let target = null;
  if (action === "approve") {
    target = await campus();
    if (requestRow.institution_directory?.campus_id && requestRow.institution_directory.campus_id !== target.id) throw new Error("The requested institution is already linked to another campus.");
    if (!["student", "institutional"].includes(String(args.kind ?? ""))) throw new Error("Approval requires --kind student or institutional.");
    sourceUrl();
  }
  await preview(`${action} verified domain request ${id}`, { institution: requestRow.institution_id, domain: requestRow.email_domain, campus: target?.slug ?? null, enableDomain: args["enable-domain"] === true }, async () => {
    if (action === "approve") {
      const { error: approvalError } = await db.rpc("approve_institution_domain_request", {
        request_id: id,
        target_campus_id: target.id,
        mapping_kind: String(args.kind),
        input_evidence_url: sourceUrl(),
        input_reviewer: reviewedBy,
        input_confidence: reviewConfidence,
        enable_mapping: args["enable-domain"] === true,
        input_notes: String(args.notes ?? "") || null
      });
      if (approvalError) throw approvalError;
    } else {
      const status = action === "review" ? "reviewing" : action === "duplicate" ? "duplicate" : "rejected";
      const changes = { status, reviewed_by: reviewedBy, review_confidence: reviewConfidence, reviewed_at: action === "review" ? null : new Date().toISOString(), operator_notes: String(args.notes ?? "") || null };
      if (args["source-url"]) changes.evidence_url = sourceUrl();
      const { error: updateError } = await db.from("institution_domain_requests").update(changes).eq("id", id); if (updateError) throw updateError;
      await audit(null, `institution_domain_request.operator_${status}`, id, { institutionId: requestRow.institution_id, domain: requestRow.email_domain, reviewer: reviewedBy });
    }
  });
} else if (command === "requests") {
  let query = db.from("school_requests").select("id,school_name,email_domain,status,request_count,first_requested_at,last_requested_at,reviewed_at,resolution_campus_id,operator_notes").order("last_requested_at", { ascending: false }).limit(200);
  if (args.status) query = query.eq("status", String(args.status));
  const { data, error } = await query; if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
} else if (command === "request") {
  const id = String(args.id ?? "");
  const action = String(args.action ?? "review");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["review", "approve", "reject", "duplicate"].includes(action)) throw new Error("Usage: request --id <uuid> --action review|approve|reject|duplicate [--campus slug --source-url https://... --kind student|institutional --enable-domain] [--apply]");
  const { data: requestRow, error } = await db.from("school_requests").select("*").eq("id", id).single(); if (error) throw error;
  let target = null;
  if (action === "approve") {
    target = await campus();
    const kind = String(args.kind ?? "");
    if (!["student", "institutional"].includes(kind)) throw new Error("Approval requires --kind student or institutional.");
    sourceUrl();
  }
  await preview(`${action} school request ${id}`, { request: { id, school: requestRow.school_name, domain: requestRow.email_domain }, campus: target?.slug ?? null, enableDomain: args["enable-domain"] === true }, async () => {
    if (action === "approve") {
      const enableDomain = args["enable-domain"] === true;
      if (enableDomain) {
        const { data: collision } = await db.from("campus_email_domains").select("campus_id").eq("domain", requestRow.email_domain).eq("is_enabled", true).neq("campus_id", target.id);
        if (collision?.length) throw new Error("Another campus already has this domain enabled.");
      }
      const mapping = { campus_id: target.id, domain: requestRow.email_domain, is_enabled: enableDomain, review_status: "reviewed", domain_kind: String(args.kind), source_url: sourceUrl(), source_label: "Operator-reviewed school request source", reviewed_at: new Date().toISOString(), review_notes: String(args.notes ?? "Approved from school request") };
      const { error: mappingError } = await db.from("campus_email_domains").upsert(mapping, { onConflict: "campus_id,domain" }); if (mappingError) throw mappingError;
      const { error: requestError } = await db.from("school_requests").update({ status: "approved", reviewed_at: new Date().toISOString(), resolution_campus_id: target.id, operator_notes: String(args.notes ?? "") || null }).eq("id", id); if (requestError) throw requestError;
      await audit(target.id, "school_request.operator_approved", id, { domain: requestRow.email_domain, enabled: enableDomain });
    } else {
      const status = action === "review" ? "reviewing" : action === "duplicate" ? "duplicate" : "rejected";
      const { error: requestError } = await db.from("school_requests").update({ status, reviewed_at: action === "review" ? null : new Date().toISOString(), operator_notes: String(args.notes ?? "") || null }).eq("id", id); if (requestError) throw requestError;
      await audit(null, `school_request.operator_${status}`, id, { domain: requestRow.email_domain });
    }
  });
} else if (command === "setting") {
  const key = String(args.key ?? "");
  const allowed = { network_features_enabled: "boolean", message_request_daily_limit: "integer", message_request_decline_cooldown_days: "integer", blocked_conversation_visibility: "mode" };
  if (!allowed[key]) throw new Error(`Allowed settings: ${Object.keys(allowed).join(", ")}`);
  let value;
  if (allowed[key] === "boolean") { if (!["true", "false"].includes(String(args.value))) throw new Error("Boolean setting requires --value true or false."); value = String(args.value) === "true"; }
  else if (allowed[key] === "integer") { value = Number(args.value); if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error("Integer setting must be between 0 and 1000."); }
  else { value = String(args.value); if (!["read_only", "hidden"].includes(value)) throw new Error("Visibility mode must be read_only or hidden."); }
  await preview(`update runtime setting ${key}`, { key, value }, async () => { const { error } = await db.from("runtime_settings").upsert({ key, value }, { onConflict: "key" }); if (error) throw error; await audit(null, "runtime_setting.operator_update", key, { value }); });
} else if (command === "platform-role") {
  const username = String(args.username ?? "").toLowerCase();
  const role = String(args.role ?? "moderator");
  const action = String(args.action ?? "grant");
  if (!username || !["moderator", "admin"].includes(role) || !["grant", "revoke"].includes(action)) throw new Error("Usage: platform-role --username handle --role moderator|admin --action grant|revoke [--apply]");
  const { data: profile, error } = await db.from("profiles").select("id,campus_id,handle").eq("handle", username).single(); if (error) throw error;
  await preview(`${action} platform ${role} for @${username}`, { profileId: profile.id, role, action }, async () => { let mutationError; if (action === "grant") ({ error: mutationError } = await db.from("platform_role_assignments").upsert({ profile_id: profile.id, role }, { onConflict: "profile_id,role" })); else ({ error: mutationError } = await db.from("platform_role_assignments").delete().eq("profile_id", profile.id).eq("role", role)); if (mutationError) throw mutationError; await audit(profile.campus_id, `platform_role.operator_${action}`, profile.id, { role }); });
} else {
  throw new Error("Commands: list, upsert, status, domain, institutions, institution, domain-requests, domain-request, requests, request, setting, platform-role");
}
