"use client";

import { useState } from "react";

type Profile = { id: string; username: string; displayName: string; status: "active" | "suspended" };

export function AdminProfiles({ initialProfiles }: { initialProfiles: Profile[] }) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [error, setError] = useState("");
  async function moderate(profile: Profile) {
    const action = profile.status === "active" ? "suspend" : "restore";
    const reason = window.prompt(`Reason to ${action} @${profile.username}:`)?.trim();
    if (!reason || reason.length < 3) return;
    const response = await fetch(`/api/v1/admin/profiles/${profile.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error?.message ?? "Unable to change this account.");
    setProfiles(rows => rows.map(row => row.id === profile.id ? { ...row, status: action === "suspend" ? "suspended" : "active" } : row));
    setError("");
  }
  return <section className="admin-content"><div className="section-heading"><div><span className="overline">MEMBER SAFETY</span><h2>Campus accounts</h2></div></div>{error && <p className="form-error">{error}</p>}<div className="managed-list">{profiles.map(profile => <article key={profile.id}><div><span className={`severity ${profile.status === "suspended" ? "high" : "low"}`}>{profile.status}</span><h3>{profile.displayName}</h3><p>@{profile.username}</p></div><button className={`button button-small ${profile.status === "active" ? "button-danger" : "button-ghost"}`} onClick={() => moderate(profile)}>{profile.status === "active" ? "Suspend" : "Restore"}</button></article>)}</div>{!profiles.length && <div className="empty-state compact"><p>No campus accounts available.</p></div>}</section>;
}
