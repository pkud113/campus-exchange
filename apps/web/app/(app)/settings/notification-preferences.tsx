"use client";

import { useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";

type Preferences = { emailMessages: boolean; emailDiscussions: boolean; quietHoursStart: number | null; quietHoursEnd: number | null };

export function NotificationPreferences({ initial }: { initial: Preferences }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const quietEnabled = value.quietHoursStart !== null;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    const response = await fetch("/api/v1/notification-preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    setNotice(response.ok ? "Email preferences saved." : "Email preferences could not be saved."); setBusy(false);
  }
  return <form className="settings-form notification-preferences" onSubmit={save}>
    <Mail /><h2>Email notifications</h2>
    <p>In-app notifications remain available. Quiet hours use your campus&apos;s local time and suppress email rather than delaying it.</p>
    <label className="check-row"><input type="checkbox" checked={value.emailMessages} onChange={(event) => setValue({ ...value, emailMessages: event.target.checked })}/>New message emails</label>
    <label className="check-row"><input type="checkbox" checked={value.emailDiscussions} onChange={(event) => setValue({ ...value, emailDiscussions: event.target.checked })}/>Discussion update emails</label>
    <label className="check-row"><input type="checkbox" checked={quietEnabled} onChange={(event) => setValue({ ...value, quietHoursStart: event.target.checked ? 22 : null, quietHoursEnd: event.target.checked ? 7 : null })}/>Use quiet hours</label>
    {quietEnabled && <div className="form-row"><label>Start hour (0–23)<input type="number" min={0} max={23} value={value.quietHoursStart ?? 22} onChange={(event) => setValue({ ...value, quietHoursStart: Number(event.target.value) })}/></label><label>End hour (0–23)<input type="number" min={0} max={23} value={value.quietHoursEnd ?? 7} onChange={(event) => setValue({ ...value, quietHoursEnd: Number(event.target.value) })}/></label></div>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <button className="button button-primary" disabled={busy}>{busy ? <><LoaderCircle className="spin"/> Saving…</> : "Save email preferences"}</button>
  </form>;
}
