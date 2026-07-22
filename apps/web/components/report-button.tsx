"use client";

import { Flag, X } from "lucide-react";
import { useState } from "react";

type ReportTarget = "listing" | "event" | "profile" | "message" | "conversation_request" | "community" | "discussion_post" | "discussion_comment" | "organization" | "organization_channel" | "organization_message" | "organization_role" | "organization_membership" | "social_post" | "social_comment" | "institution" | "account_security";

export function ReportButton({ targetType, targetId, label = "Report", className = "button button-ghost button-small" }: { targetType: ReportTarget; targetId: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType, targetId, reason: form.get("reason"), details: form.get("details"), idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json().catch(() => null); setBusy(false);
    if (response.ok) { setNotice("Report submitted to the appropriate safety team."); setTimeout(() => setOpen(false), 900); }
    else setNotice(body?.error?.message ?? "Unable to submit this report.");
  }
  return <><button className={className} type="button" onClick={() => setOpen(true)}><Flag /> {label}</button>{open && <div className="composer-modal-layer" role="presentation"><button className="mobile-drawer-backdrop" aria-label="Close report" onClick={() => setOpen(false)} /><form className="composer-modal listing-form" role="dialog" aria-modal="true" aria-labelledby={`report-${targetId}`} onSubmit={submit}><header><div><span className="overline">TRUST &amp; SAFETY</span><h2 id={`report-${targetId}`}>Report {targetType.replaceAll("_", " ")}</h2></div><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X /></button></header><label>Reason<select name="reason" required><option value="harassment">Harassment</option><option value="fraud">Fraud or impersonation</option><option value="spam">Spam</option><option value="unsafe">Safety concern</option><option value="prohibited_item">Prohibited content</option><option value="other">Other</option></select></label><label>What happened?<textarea name="details" rows={5} maxLength={2000} /></label>{notice && <p className="form-notice" role="status">{notice}</p>}<div className="form-actions"><button type="button" className="button button-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button button-danger" disabled={busy}>{busy ? "Submitting…" : "Submit report"}</button></div></form></div>}</>;
}
