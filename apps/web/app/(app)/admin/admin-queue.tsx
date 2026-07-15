"use client";

import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

type Snapshot = Record<string, unknown>;
type Report = { id: string; target_type: string; target_id: string; reason: string; details: string; message_snapshot: Snapshot | null; content_snapshot?: Snapshot | null; status: string; created_at: string; profiles?: unknown };

function SnapshotView({ snapshot, label }: { snapshot: Snapshot; label: string }) {
  const safeFields = Object.entries(snapshot).filter(([key]) => !["email", "signedUrl", "credential"].includes(key));
  return <div className="report-note"><span>{label}</span>{safeFields.map(([key, value]) => <p key={key}><strong>{key.replaceAll(/([A-Z])/g, " $1")}: </strong>{typeof value === "string" ? value : JSON.stringify(value)}</p>)}</div>;
}

export function AdminQueue({ initialReports, initialSelectedId }: { initialReports: Report[]; initialSelectedId?: string | undefined }) {
  const [reports, setReports] = useState(initialReports);
  const [selectedId, setSelectedId] = useState(initialReports.some((report) => report.id === initialSelectedId) ? initialSelectedId! : initialReports[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => reports.find((report) => report.id === selectedId), [reports, selectedId]);
  async function act(action: "dismiss" | "warn" | "hide_content" | "suspend" | "restore") {
    if (!selected || reason.trim().length < 3) { setError("Add decision notes before taking action."); return; }
    setBusy(true);
    const response = await fetch(`/api/v1/admin/reports/${selected.id}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason }) });
    const result = await response.json();
    if (response.ok) { const remaining = reports.filter((report) => report.id !== selected.id); setReports(remaining); setSelectedId(remaining[0]?.id ?? ""); setReason(""); setError(""); }
    else setError(result.error?.message ?? "Unable to resolve report.");
    setBusy(false);
  }
  return <main className="dashboard"><section className="welcome-row"><div><span className="overline">TRUST &amp; SAFETY</span><h1>Moderation queue</h1><p>Review protected report snapshots without unrestricted access to private content.</p></div><span className="staff-pill"><ShieldCheck/> MFA-protected workspace</span></section><div className="stat-grid"><article><AlertTriangle/><div><strong>{reports.length}</strong><span>Open reports</span></div></article><article><Clock3/><div><strong>{reports[0] ? Math.max(1, Math.round((Date.now() - new Date(reports[0].created_at).getTime()) / 60000)) : 0}m</strong><span>Oldest unreviewed</span></div></article><article><CheckCircle2/><div><strong>Live</strong><span>Audit logging enabled</span></div></article></div><div className="moderation-layout"><section className="report-list"><header><h2>Open reports</h2><span>Oldest first</span></header>{!reports.length && <div className="empty-state"><CheckCircle2/><h2>Queue clear</h2></div>}{reports.map((report) => <button key={report.id} className={`report-row ${report.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(report.id)}><span className={`severity ${report.reason === "fraud" ? "high" : report.reason === "unsafe" ? "medium" : "low"}`}>{report.reason}</span><strong>{report.target_type} report</strong><p>{report.details || "No additional details"}</p><small>{new Date(report.created_at).toLocaleString()}</small></button>)}</section><section className="report-detail">{selected ? <><span className={`severity ${selected.reason === "fraud" ? "high" : "medium"}`}>{selected.reason}</span><h2>{selected.target_type} report</h2><dl><div><dt>Target</dt><dd>{selected.target_type}</dd></div><div><dt>Submitted</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div><div><dt>Status</dt><dd>{selected.status}</dd></div></dl><div className="report-note"><span>Reporter&apos;s note</span><p>{selected.details || "No additional details were supplied."}</p></div>{selected.target_type === "message" && selected.message_snapshot && <SnapshotView snapshot={selected.message_snapshot} label="Reported message snapshot"/>}{selected.content_snapshot && <SnapshotView snapshot={selected.content_snapshot} label="Protected content snapshot"/>}<label>Decision notes<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the reason for this action…"/></label>{error && <p className="form-error">{error}</p>}<div className="moderation-actions"><button className="button button-danger" disabled={busy} onClick={() => void act(selected.target_type === "profile" ? "suspend" : "hide_content")}>{selected.target_type === "profile" ? "Suspend account" : "Hide content"}</button><button className="button button-ghost" disabled={busy} onClick={() => void act("warn")}>Warn user</button><button className="button button-ghost" disabled={busy} onClick={() => void act("dismiss")}>Dismiss</button></div></> : <div className="empty-state"><CheckCircle2/><h2>No report selected</h2></div>}</section></div></main>;
}
