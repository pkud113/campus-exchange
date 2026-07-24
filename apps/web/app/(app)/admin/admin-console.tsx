"use client";

import type { StaffCapability } from "@campus-exchange/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, FileClock, Gauge, Search, Settings, ShieldCheck, UsersRound } from "lucide-react";
import { EmptyState, SurfaceCard } from "@/components/ui";
import { AdminQueue } from "./admin-queue";

type Section = "overview" | "institutions" | "users" | "staff" | "cases" | "content" | "audit" | "settings";
type Case = Parameters<typeof AdminQueue>[0]["initialCases"][number];
type StaffContext = {
  campusId: string;
  scope: "platform" | "campus";
  platformRole: string | null;
  campusRole: string | null;
  capabilities: StaffCapability[];
};
type Institution = { institution_id: string; name: string; city: string; region: string; status: string; registration_status: string; campus_id: string | null; campus_status: string | null; member_count: number; verification_count: number };
type UserRow = { id: string; handle: string; display_name: string | null; status: string; account_kind: string; verified_until: string | null; restricted_until: string | null; campus_id: string; campuses: { name: string; short_name: string; institution_id: string } | Array<{ name: string; short_name: string; institution_id: string }> };
type Operator = { profile_id: string; handle: string; display_name: string | null; campus_id: string; campus_name: string; campus_short_name: string; campus_role: string | null; platform_role: string | null };
type AuditRow = { id: number; campus_id: string | null; actor_id: string | null; action: string; target_type: string; target_id: string; metadata: Record<string, unknown>; created_at: string };
type OperationalSetting = { key: string; label: string; description: string; value_type: "boolean" | "integer" | "text"; minimum_integer: number | null; maximum_integer: number | null; value: unknown };

const sections: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "institutions", label: "Institutions" },
  { id: "users", label: "Users" },
  { id: "staff", label: "Staff" },
  { id: "cases", label: "Cases & appeals" },
  { id: "content", label: "Content" },
  { id: "audit", label: "Audit" },
  { id: "settings", label: "Settings" }
];

async function readData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Administrative request failed.");
  return json.data as T;
}

export function AdminConsole({
  context,
  initialCases,
  initialSection,
  initialSelectedId
}: {
  context: StaffContext;
  initialCases: Case[];
  initialSection: Section;
  initialSelectedId?: string;
}) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [settingsRows, setSettingsRows] = useState<OperationalSetting[]>([]);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");

  const can = useCallback((capability: StaffCapability) => context.capabilities.includes(capability), [context.capabilities]);
  const load = useCallback(async () => {
    try {
      if (initialSection === "institutions" && can("institutions.read")) setInstitutions(await readData(`/api/v1/admin/institutions?q=${encodeURIComponent(query)}`));
      if (initialSection === "users" && can("users.read")) setUsers(await readData(`/api/v1/admin/users?q=${encodeURIComponent(query)}`));
      if (initialSection === "staff" && can("cases.read")) setOperators(await readData(`/api/v1/admin/operators?q=${encodeURIComponent(query)}`));
      if (initialSection === "audit" && can("audit.read")) setAudit(await readData("/api/v1/admin/audit"));
      if (initialSection === "settings" && can("settings.manage")) setSettingsRows(await readData("/api/v1/admin/settings"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load this section.");
    }
  }, [can, initialSection, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function applyAction(action: string, targetType: string, targetId: string) {
    if (reason.trim().length < 10) {
      setNotice("Enter an operational reason of at least 10 characters.");
      return;
    }
    try {
      await readData("/api/v1/admin/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, targetType, targetId, reason, idempotencyKey: crypto.randomUUID() })
      });
      setNotice("Action applied through an audited operational case.");
      setReason("");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to apply the action.");
    }
  }

  async function inviteModerator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await requestData("/api/v1/admin/staff/invite", {
        email: form.get("email"),
        campusId: form.get("campusId"),
        reason: form.get("reason"),
        idempotencyKey: crypto.randomUUID()
      });
      setNotice("Moderator invitation created and audited.");
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to invite this moderator.");
    }
  }

  async function revokeModerator(profileId: string) {
    if (reason.trim().length < 10) {
      setNotice("Enter a revocation reason of at least 10 characters.");
      return;
    }
    try {
      await requestData(`/api/v1/admin/staff/${profileId}/revoke`, { reason, idempotencyKey: crypto.randomUUID() });
      setNotice("Moderator role revoked and audited.");
      setReason("");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to revoke this moderator.");
    }
  }

  return <main className="dashboard feature-page admin-console">
    <header className="moderation-center-header">
      <div><span className="overline">OPERATIONS</span><h1>Administration console</h1><p>Scoped platform operations, safety review, restoration, and immutable audit history.</p></div>
      <span className="staff-pill"><ShieldCheck /> {context.scope} scope · AAL2 protected</span>
    </header>
    <nav className="settings-tabs" aria-label="Administration sections">
      {sections.filter((section) => section.id !== "settings" || can("settings.manage")).map((section) =>
        <Link key={section.id} className={initialSection === section.id ? "active" : ""} href={`/admin?section=${section.id}`}>{section.label}</Link>
      )}
    </nav>
    {notice && <p className="form-notice" role="status">{notice}</p>}

    {initialSection === "overview" && <section className="settings-grid">
      <SurfaceCard><Gauge /><h2>Role and scope</h2><p>{context.platformRole ?? context.campusRole} · {context.scope}</p><small>{context.capabilities.length} capabilities resolved server-side.</small></SurfaceCard>
      <SurfaceCard><ShieldCheck /><h2>Privileged access</h2><p>Every list, detail, and action rechecks AAL2 and staff scope in the database.</p></SurfaceCard>
      <SurfaceCard><FileClock /><h2>Operational cases</h2><p>Administrative mutations require a reason, idempotency key, and protected before-state.</p></SurfaceCard>
    </section>}

    {["institutions", "users", "staff"].includes(initialSection) && <div className="moderation-toolbar">
      <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${initialSection}`} /></label>
    </div>}

    {initialSection === "institutions" && <section className="managed-list">
      {!institutions.length && <EmptyState icon={<Building2 />} title="No institutions in scope" description="Try another directory search." />}
      {institutions.map((institution) => <article key={institution.institution_id}>
        <div><h3>{institution.name}</h3><p>{institution.city}, {institution.region} · UNITID {institution.institution_id}</p><small>{institution.registration_status} · campus {institution.campus_status ?? "not provisioned"} · {institution.member_count} members · {institution.verification_count} verifications</small></div>
        {can("institutions.manage") && <div className="moderation-actions">
          <button className="button button-ghost button-small" onClick={() => void applyAction(institution.registration_status === "open" ? "suspend_registration" : "open_registration", "institution", institution.institution_id)}>{institution.registration_status === "open" ? "Suspend registration" : "Open registration"}</button>
          {institution.campus_id && <button className="button button-ghost button-small" onClick={() => void applyAction(institution.campus_status === "enabled" ? "suspend_campus" : "enable_campus", "institution", institution.institution_id)}>{institution.campus_status === "enabled" ? "Suspend campus" : "Enable campus"}</button>}
        </div>}
      </article>)}
      {can("institutions.manage") && <label>Required operational reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} /></label>}
    </section>}

    {initialSection === "users" && <section className="managed-list">
      {!users.length && <EmptyState icon={<UsersRound />} title="No users in scope" description="Search by handle or display name." />}
      {users.map((user) => {
        const campus = Array.isArray(user.campuses) ? user.campuses[0] : user.campuses;
        return <article key={user.id}><div><h3>{user.display_name ?? `@${user.handle}`}</h3><p>@{user.handle} · {campus?.short_name} · {user.account_kind}</p><small>{user.status} · verification {user.verified_until ? new Date(user.verified_until).toLocaleDateString() : "not applicable"}</small></div>
          {can("users.restrict") && <div className="moderation-actions"><button className="button button-ghost button-small" onClick={() => void applyAction("restrict", "profile", user.id)}>Restrict 7 days</button><button className="button button-danger button-small" onClick={() => void applyAction(user.status === "active" ? "suspend" : "restore", "profile", user.id)}>{user.status === "active" ? "Suspend" : "Restore"}</button></div>}
        </article>;
      })}
      {can("users.restrict") && <label>Required operational reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} /></label>}
    </section>}

    {initialSection === "staff" && <section className="admin-content">
      {can("campus_moderators.manage") && <SurfaceCard><form className="form-grid" onSubmit={inviteModerator}><h2 className="full">Invite a campus moderator</h2><label>Email<input name="email" type="email" required /></label><label>Campus ID<input name="campusId" type="text" defaultValue={context.campusId} required /></label><label className="full">Reason<textarea name="reason" minLength={10} maxLength={2000} required /></label><button className="button button-primary">Create invitation</button></form></SurfaceCard>}
      <div className="managed-list">{operators.map((operator) => <article key={operator.profile_id}><div><h3>{operator.display_name ?? `@${operator.handle}`}</h3><p>@{operator.handle} · {operator.campus_short_name}</p><small>{operator.platform_role ?? operator.campus_role}</small></div>{operator.campus_role === "moderator" && can("campus_moderators.manage") && <button className="button button-danger button-small" onClick={() => void revokeModerator(operator.profile_id)}>Revoke moderator</button>}</article>)}</div>
      {can("campus_moderators.manage") && <label>Required revocation reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} /></label>}
    </section>}

    {initialSection === "cases" && <AdminQueue initialCases={initialCases} scope={context.scope === "platform" ? "Platform" : "Campus"} {...(initialSelectedId ? { initialSelectedId } : {})} />}

    {initialSection === "content" && <section className="settings-grid">
      {[
        ["Social", "Posts and network activity"],
        ["Discussions", "Campus-private communities and threads"],
        ["Organizations", "Channels, roles, memberships, and messages"],
        ["Marketplace", "Listings and exchange safety"],
        ["Events", "Campus and network events"]
      ].map(([title, description]) => <SurfaceCard key={title}><h2>{title}</h2><p>{description}</p><small>Actions open an audited case and use soft restriction/removal with restoration.</small></SurfaceCard>)}
    </section>}

    {initialSection === "audit" && <section className="managed-list">
      {audit.map((row) => <article key={row.id}><div><h3>{row.action}</h3><p>{row.target_type} · {row.target_id}</p><small>{new Date(row.created_at).toLocaleString()} · actor {row.actor_id?.slice(0, 8) ?? "system"}</small></div></article>)}
    </section>}

    {initialSection === "settings" && <section className="managed-list">
      {settingsRows.map((setting) => <SettingRow key={setting.key} setting={setting} onSaved={() => void load()} onNotice={setNotice} />)}
    </section>}
  </main>;
}

async function requestData(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Administrative request failed.");
  return json.data;
}

function SettingRow({ setting, onSaved, onNotice }: { setting: OperationalSetting; onSaved: () => void; onNotice: (value: string) => void }) {
  const [value, setValue] = useState(String(setting.value ?? ""));
  const [reason, setReason] = useState("");
  async function save() {
    const parsedValue = setting.value_type === "boolean" ? value === "true" : setting.value_type === "integer" ? Number(value) : value;
    const response = await fetch("/api/v1/admin/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: setting.key, value: parsedValue, reason, idempotencyKey: crypto.randomUUID() }) });
    const json = await response.json();
    onNotice(response.ok ? "Operational setting updated and audited." : json.error?.message ?? "Unable to update setting.");
    if (response.ok) { setReason(""); onSaved(); }
  }
  return <article><div><h3>{setting.label}</h3><p>{setting.description}</p><small>{setting.key}</small></div><div className="moderation-actions">
    {setting.value_type === "boolean" ? <select value={value} onChange={(event) => setValue(event.target.value)}><option value="true">Enabled</option><option value="false">Disabled</option></select> : <input value={value} onChange={(event) => setValue(event.target.value)} type={setting.value_type === "integer" ? "number" : "text"} min={setting.minimum_integer ?? undefined} max={setting.maximum_integer ?? undefined} />}
    <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required reason" minLength={10} />
    <button className="button button-primary button-small" disabled={reason.trim().length < 10} onClick={() => void save()}><Settings />Save</button>
  </div></article>;
}
