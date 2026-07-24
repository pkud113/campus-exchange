"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, CirclePlus, Search } from "lucide-react";
import { InstitutionFilter } from "@/components/institution-filter";
import { EmptyState, SurfaceCard } from "@/components/ui";

type Organization = {
  id: string;
  slug: string;
  name: string;
  description: string;
  member_count: number;
  visibility: string;
  membership_policy: string;
  is_official: boolean;
  campuses?: { short_name?: string } | Array<{ short_name?: string }>;
};

export function OrganizationsClient({
  initialCreating = false,
  initialInstitution = "my"
}: {
  initialCreating?: boolean;
  initialInstitution?: string;
}) {
  const [rows, setRows] = useState<Organization[]>([]);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(initialCreating);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/organizations?institution=${encodeURIComponent(initialInstitution)}&q=${encodeURIComponent(q)}`);
    const json = await response.json();
    setRows(response.ok ? json.data : []);
    if (!response.ok) setNotice(json.error?.message ?? "Unable to load organizations.");
  }, [q, initialInstitution]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: form.get("slug"),
        name: form.get("name"),
        description: form.get("description"),
        visibility: form.get("visibility"),
        membershipPolicy: form.get("membershipPolicy"),
        websiteUrl: null,
        idempotencyKey: crypto.randomUUID()
      })
    });
    const json = await response.json();
    if (!response.ok) {
      setNotice(json.error?.message ?? "Unable to create organization.");
      return;
    }
    window.location.assign(`/organizations/${json.data.slug}`);
  }

  return <>
    <div className="feature-toolbar">
      <label><Search /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search organizations" aria-label="Search organizations" /></label>
      <InstitutionFilter value={initialInstitution} />
      <button className="button button-primary" onClick={() => setCreating((value) => !value)}><CirclePlus />Create</button>
    </div>
    {creating && <SurfaceCard className="organization-create">
      <form onSubmit={create}>
        <h2>Create an organization</h2>
        <div className="form-grid">
          <label>Name<input name="name" minLength={3} maxLength={120} required /></label>
          <label>Slug<input name="slug" pattern="[a-z0-9][a-z0-9-]{2,62}" required /></label>
          <label className="full">Description<textarea name="description" minLength={10} maxLength={5000} required /></label>
          <label>Audience<select name="visibility"><option value="campus_only">My campus</option><option value="network">Campus Exchange network</option></select></label>
          <label>Membership<select name="membershipPolicy"><option value="approval_required">Requests require approval</option><option value="open">Open membership</option><option value="invitation_only">Invitation only</option></select></label>
        </div>
        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={() => setCreating(false)}>Cancel</button>
          <button className="button button-primary">Create organization</button>
        </div>
      </form>
    </SurfaceCard>}
    <section className="organization-grid">
      {!rows.length && <EmptyState icon={<Building2 />} title="No organizations found" description="Try another institution or create the first group for this interest." />}
      {rows.map((organization) => {
        const campus = Array.isArray(organization.campuses) ? organization.campuses[0] : organization.campuses;
        return <Link href={`/organizations/${organization.slug}`} key={organization.id}>
          <SurfaceCard className="organization-card">
            <span className="organization-mark"><Building2 /></span>
            <div>
              <div className="content-badges">
                <span className="ui-badge">{campus?.short_name ?? "Campus"}</span>
                {organization.is_official && <span className="ui-badge ui-badge-accent">Official</span>}
                <span className="ui-badge">{organization.visibility.replace("_", " ")}</span>
              </div>
              <h2>{organization.name}</h2>
              <p>{organization.description}</p>
              <small>{organization.member_count} {organization.member_count === 1 ? "member" : "members"} · {organization.membership_policy.replaceAll("_", " ")}</small>
            </div>
          </SurfaceCard>
        </Link>;
      })}
    </section>
    {notice && <p className="form-notice" role="status">{notice}</p>}
  </>;
}
