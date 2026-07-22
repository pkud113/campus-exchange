"use client";

import { MessageCircle, Pencil, Reply, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, EmptyState, TextArea } from "@/components/ui";
import { ConfirmationDialog } from "@/components/ui-interactive";
import { UserAvatar } from "@/components/user-avatar";
import { SocialReportAction } from "./social-report-action";

export type SocialCommentView = { id: string; post_id: string; author_profile_id: string | null; parent_comment_id: string | null; body: string | null; edited_at: string | null; removed_at: string | null; deleted_at: string | null; created_at: string; canManage: boolean; author: Record<string, unknown> | null };

function value(record: Record<string, unknown> | null, key: string) { const result = record?.[key]; return typeof result === "string" ? result : null; }

export function SocialComments({ postId, initialComments }: { postId: string; initialComments: SocialCommentView[] }) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const roots = comments.filter((comment) => !comment.parent_comment_id);

  async function reload() {
    const response = await fetch(`/api/v1/social/posts/${postId}/comments`);
    const result = await response.json();
    if (response.ok) setComments(result.data);
  }

  async function publish(body: string, parentCommentId: string | null) {
    if (!body.trim()) return;
    setBusy(true); setStatus("");
    const response = await fetch(`/api/v1/social/posts/${postId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: body.trim(), parentCommentId, idempotencyKey: crypto.randomUUID() }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) { setStatus(result.error?.message ?? "Unable to add this comment."); return; }
    if (parentCommentId) { setReplyTo(null); setReplyDraft(""); } else setDraft("");
    await reload();
  }

  async function saveEdit(commentId: string) {
    if (!editDraft.trim()) return;
    setBusy(true); setStatus("");
    const response = await fetch(`/api/v1/social/posts/${postId}/comments/${commentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: editDraft.trim() }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) { setStatus(result.error?.message ?? "Unable to update this comment."); return; }
    setEditing(null); setEditDraft(""); await reload();
  }

  async function remove() {
    if (!deleteTarget) return;
    setBusy(true); setStatus("");
    const response = await fetch(`/api/v1/social/posts/${postId}/comments/${deleteTarget}`, { method: "DELETE" });
    const result = await response.json(); setBusy(false);
    if (!response.ok) { setStatus(result.error?.message ?? "Unable to delete this comment."); return; }
    setDeleteTarget(null); await reload();
  }

  function renderComment(comment: SocialCommentView, child = false) {
    const handle = value(comment.author, "handle") ?? "member";
    const name = value(comment.author, "display_name") ?? handle;
    const tombstone = comment.deleted_at ? "Comment deleted by its author." : comment.removed_at ? "Comment removed by moderation." : null;
    return <article className={`social-comment${child ? " social-comment-reply" : ""}`} key={comment.id}>
      <UserAvatar name={name} mediaId={value(comment.author, "avatar_media_id")} />
      <div className="social-comment-content"><header><Link href={`/u/${handle}`}><strong>{name}</strong></Link><span>@{handle} · <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time>{comment.edited_at ? " · Edited" : ""}</span></header>
        {editing === comment.id && !tombstone ? <div className="social-comment-edit"><TextArea value={editDraft} maxLength={4000} rows={3} onChange={(event) => setEditDraft(event.target.value)} /><div><Button size="small" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button size="small" busy={busy} onClick={() => saveEdit(comment.id)}>Save</Button></div></div> : <p className={tombstone ? "social-comment-tombstone" : ""}>{tombstone ?? comment.body}</p>}
        {!tombstone && editing !== comment.id && <div className="social-comment-actions">{!child && <button type="button" onClick={() => { setReplyTo(comment.id); setReplyDraft(""); }}><Reply /> Reply</button>}{comment.canManage ? <><button type="button" onClick={() => { setEditing(comment.id); setEditDraft(comment.body ?? ""); }}><Pencil /> Edit</button><button type="button" onClick={() => setDeleteTarget(comment.id)}><Trash2 /> Delete</button></> : <SocialReportAction targetType="social_comment" targetId={comment.id} />}</div>}
        {replyTo === comment.id && <div className="social-reply-composer"><TextArea aria-label={`Reply to ${name}`} rows={3} maxLength={4000} value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} placeholder={`Reply to ${name}`} /><div><Button size="small" variant="ghost" onClick={() => setReplyTo(null)}>Cancel</Button><Button size="small" busy={busy} onClick={() => publish(replyDraft, comment.id)}><Send /> Reply</Button></div></div>}
        {!child && comments.filter((item) => item.parent_comment_id === comment.id).map((reply) => renderComment(reply, true))}
      </div>
    </article>;
  }

  return <section className="social-comments" aria-labelledby="comments-title">
    <header><div><span className="overline">CONVERSATION</span><h2 id="comments-title">Comments</h2></div><span>{comments.filter((comment) => !comment.deleted_at && !comment.removed_at).length}</span></header>
    <form className="social-root-comment" onSubmit={(event) => { event.preventDefault(); void publish(draft, null); }}><label htmlFor="root-comment">Join the conversation</label><TextArea id="root-comment" rows={4} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add something useful…" /><Button type="submit" busy={busy} disabled={!draft.trim()}><Send /> Comment</Button></form>
    {status && <p className="form-error" role="status">{status}</p>}
    <div className="social-comment-list">{roots.length ? roots.map((comment) => renderComment(comment)) : <EmptyState icon={<MessageCircle />} title="No comments yet" description="Start a thoughtful conversation about this post." compact />}</div>
    <ConfirmationDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={remove} title="Delete this comment?" description="It will become a tombstone immediately and be scheduled for permanent purge after 30 days." confirmLabel="Delete comment" destructive busy={busy} />
  </section>;
}
