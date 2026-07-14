"use client";
import { Bookmark, LogIn, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DiscussionSave({ postId, initialSaved = false }: { postId: string; initialSaved?: boolean }) {
  const [saved, setSaved] = useState(initialSaved); const [busy, setBusy] = useState(false);
  async function toggle() { if (busy) return; const previous = saved; const next = !saved; setSaved(next); setBusy(true); const response = await fetch(`/api/v1/discussions/posts/${postId}/save`, { method: next ? "POST" : "DELETE", ...(next ? { headers: { "content-type": "application/json" }, body: "{}" } : {}) }).catch(() => null); const result = await response?.json().catch(() => null); if (!response?.ok) setSaved(previous); else setSaved(Boolean(result?.data?.saved)); setBusy(false); }
  return <button className={saved ? "discussion-icon-action active" : "discussion-icon-action"} type="button" onClick={toggle} disabled={busy} aria-pressed={saved}><Bookmark/>{saved ? "Saved" : "Save"}</button>;
}

export function CommunityJoinButton({ slug, initialJoined, owner = false }: { slug: string; initialJoined: boolean; owner?: boolean }) {
  const router = useRouter(); const [joined, setJoined] = useState(initialJoined); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function toggle() { if (busy || owner) return; setBusy(true); setError(""); const next = !joined; const response = await fetch(`/api/v1/discussions/communities/${slug}/join`, { method: next ? "POST" : "DELETE", ...(next ? { headers: { "content-type": "application/json" }, body: "{}" } : {}) }); const result = await response.json().catch(() => null); if (response.ok) { setJoined(next); router.refresh(); } else setError(result?.error?.message ?? "Unable to update membership."); setBusy(false); }
  return <div className="discussion-join">{owner ? <span className="role-pill">Owner</span> : <button className={joined ? "button button-ghost" : "button button-primary"} type="button" disabled={busy} onClick={toggle}>{joined ? <><LogOut/>Leave</> : <><LogIn/>Join community</>}</button>}{error && <small role="alert">{error}</small>}</div>;
}
