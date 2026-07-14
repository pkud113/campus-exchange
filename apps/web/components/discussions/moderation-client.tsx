"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

type Profile = { id: string; handle: string; display_name: string | null };
type Member = { role: string; state: string; banned_reason?: string | null; profiles: Profile | Profile[] };
type QueueData = { reports: Array<Record<string, any>>; removedPosts: Array<Record<string, any>>; removedComments: Array<Record<string, any>>; actions: Array<Record<string, any>> };
const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;

export function ModerationClient({ slug, communityId, isOwner, communityStatus }: { slug: string; communityId: string; isOwner: boolean; communityStatus: "active" | "archived" | "deleted" }) {
  const [data, setData] = useState<QueueData>({ reports: [], removedPosts: [], removedComments: [], actions: [] });
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [queue, memberResponse] = await Promise.all([
      fetch(`/api/v1/discussions/communities/${slug}/moderation`),
      fetch(`/api/v1/discussions/communities/${slug}/members`)
    ]);
    const [q, m] = await Promise.all([queue.json(), memberResponse.json()]);
    if (queue.ok) setData(q.data);
    else setError(q.error?.message ?? "Unable to load moderation queue.");
    if (memberResponse.ok) setMembers(m.data);
    setLoading(false);
  }, [slug]);
  useEffect(() => { void load(); }, [load]);

  async function act(action: string, targetType: string, targetId: string) {
    const needsReason = ["remove_post", "remove_comment", "ban_member", "archive"].includes(action);
    const reason = needsReason ? window.prompt("Reason for this action") ?? "" : "Community moderation action";
    if (needsReason && reason.trim().length < 3) return;
    const response = await fetch(`/api/v1/discussions/communities/${slug}/moderation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, targetType, targetId, reason, idempotencyKey: crypto.randomUUID() })
    });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message ?? "Moderation action failed.");
    else await load();
  }

  if (loading) return <div className="center-state"><LoaderCircle className="spin"/>Loading moderation tools…</div>;
  return <div className="discussion-moderation">
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="dashboard-panel"><h2><ShieldCheck/>Members and moderators</h2><div className="moderation-member-list">
      {members.map((item) => {
        const profile = one(item.profiles);
        if (!profile) return null;
        return <article key={profile.id}><div><strong>{profile.display_name ?? profile.handle}</strong><small>@{profile.handle} · {item.role} · {item.state}</small></div>{item.role !== "owner" && <div>
          {item.state === "banned" ? <button onClick={() => void act("unban_member", "member", profile.id)}>Unban</button> : <button onClick={() => void act("ban_member", "member", profile.id)}>Ban</button>}
          {isOwner && item.state === "active" && item.role === "member" && <button onClick={() => void act("add_moderator", "member", profile.id)}>Make moderator</button>}
          {isOwner && item.role === "moderator" && <button onClick={() => void act("remove_moderator", "member", profile.id)}>Remove moderator</button>}
        </div>}</article>;
      })}
    </div></section>
    <section className="dashboard-panel"><h2>Reported content</h2>{data.reports.length ? data.reports.map((report) => <article className="moderation-row" key={report.id}><div><strong>{report.target_type}</strong><p>{report.reason} · {report.details}</p></div></article>) : <p>No open discussion reports.</p>}</section>
    <section className="dashboard-panel"><h2>Removed posts and comments</h2>{data.removedPosts.map((post) => <article className="moderation-row" key={post.id}><span>{post.title}</span><button onClick={() => void act("restore_post", "post", post.id)}>Restore</button></article>)}{data.removedComments.map((comment) => <article className="moderation-row" key={comment.id}><span>Comment {String(comment.id).slice(0, 8)}</span><button onClick={() => void act("restore_comment", "comment", comment.id)}>Restore</button></article>)}{!data.removedPosts.length && !data.removedComments.length && <p>No removed content.</p>}</section>
    <section className="dashboard-panel"><h2>Recent audit activity</h2>{data.actions.slice(0, 20).map((action) => <article className="moderation-row" key={action.id}><span>{String(action.action).replaceAll("_", " ")}</span><small>{new Date(action.created_at).toLocaleString()}</small></article>)}</section>
    {isOwner && <section className="dashboard-panel danger-zone"><h2>Community state</h2><button className={communityStatus === "archived" ? "button button-primary" : "button button-danger"} onClick={() => void act(communityStatus === "archived" ? "unarchive" : "archive", "community", communityId)}>{communityStatus === "archived" ? "Restore community" : "Archive community"}</button></section>}
  </div>;
}
