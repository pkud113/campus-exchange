"use client";

import { Flag } from "lucide-react";
import { useRef, useState } from "react";
import { Button, TextArea } from "@/components/ui";
import { Dialog } from "@/components/ui-interactive";

export function SocialReportAction({ targetType, targetId }: { targetType: "social_post" | "social_comment"; targetId: string }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());

  async function submit() {
    if (details.trim().length < 3) { setStatus("Add a short explanation for the moderation team."); return; }
    setBusy(true); setStatus("");
    const response = await fetch("/api/v1/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType, targetId, reason: "other", details: details.trim(), idempotencyKey: key.current }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) { setStatus(result.error?.message ?? "Unable to submit this report."); return; }
    setOpen(false); setDetails(""); setStatus("Report submitted for review.");
  }

  return <div className="social-report-action">
    <button type="button" className="social-text-action" onClick={() => setOpen(true)}><Flag aria-hidden="true" /> Report</button>
    {status && !open && <span className="sr-only" role="status">{status}</span>}
    <Dialog open={open} onClose={() => setOpen(false)} title="Report content" description="Your report goes to the existing protected moderation queue." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button busy={busy} onClick={submit}>Submit report</Button></>}>
      <label className="social-dialog-field" htmlFor={`report-${targetId}`}><strong>What should the moderation team review?</strong><TextArea id={`report-${targetId}`} rows={5} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
      {status && <p className="form-error" role="alert">{status}</p>}
    </Dialog>
  </div>;
}
