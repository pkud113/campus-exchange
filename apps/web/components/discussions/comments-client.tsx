"use client";

import { LoaderCircle, MessageCircle, Reply, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dedupeCommentTree,
  discussionCommentRealtimeFilter,
  insertSubmittedComment,
  type DiscussionCommentNode,
} from "@/lib/discussion-comments";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DiscussionVote } from "./discussion-vote";
import { DiscussionReport } from "./discussion-report";
import { DiscussionCommentComposer } from "./discussion-comment-composer";

export function CommentsClient({ postId, currentUser, initialCommentCount = 0, locked = false }: { postId: string; currentUser: string; initialCommentCount?: number; locked?: boolean }) {
  const [comments, setComments] = useState<DiscussionCommentNode[]>([]);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const key = useRef(crypto.randomUUID());
  const loadSequence = useRef(0);
  const pendingReveal = useRef<string | null>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const response = await fetch(`/api/v1/discussions/posts/${postId}/comments`, { cache: "no-store" }).catch(() => null);
    if (!response) {
      if (sequence === loadSequence.current) {
        setError("Unable to reach the comment service.");
        setLoading(false);
      }
      return;
    }
    const result = await response.json().catch(() => null);
    if (sequence !== loadSequence.current) return;
    if (response.ok) {
      setComments(dedupeCommentTree(result?.data?.comments ?? []));
      setCommentCount(result?.data?.postCommentCount ?? initialCommentCount);
      setError("");
    } else {
      setError(result?.error?.message ?? "Unable to load comments.");
    }
    setLoading(false);
  }, [initialCommentCount, postId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const commentId = pendingReveal.current;
    if (!commentId) return;
    const target = document.getElementById(`discussion-comment-${commentId}`);
    if (!target) return;
    pendingReveal.current = null;
    target.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  }, [comments]);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = client
      .channel(`discussion-comments:${postId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "discussion_comments",
        filter: discussionCommentRealtimeFilter(postId),
      }, () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => void load(), 120);
      })
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void client.removeChannel(channel);
    };
  }, [load, postId]);

  async function submit(event: React.FormEvent<HTMLFormElement>, parentCommentId: string | null) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const idempotencyKey = key.current;
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/v1/discussions/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: form.get("body"), parentCommentId, idempotencyKey }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => null) : null;
    if (response?.ok && result?.data?.comment) {
      key.current = crypto.randomUUID();
      formElement.reset();
      if (replyTo === parentCommentId) setReplyTo(null);
      if (parentCommentId === null) {
        pendingReveal.current = result.data.comment.id;
        setComposerExpanded(false);
      }
      setComments((current) => insertSubmittedComment(current, result.data.comment, result.data.parentReplyCount ?? undefined));
      setCommentCount((current) => result.data.postCommentCount ?? current + 1);
      setSubmitting(false);
      void load();
      return;
    }
    setError(result?.error?.message ?? "Unable to add comment.");
    setSubmitting(false);
  }

  async function remove(id: string) {
    const response = await fetch(`/api/v1/discussions/comments/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Author deleted comment" }),
    });
    if (response.ok) void load();
  }

  function render(nodes: DiscussionCommentNode[]): React.ReactNode {
    return nodes.map((comment) => <article className="discussion-comment" id={`discussion-comment-${comment.id}`} style={{ "--comment-depth": Math.min(comment.depth, 4) } as React.CSSProperties} key={comment.id}>
      <div className="comment-line"/>
      <DiscussionVote targetType="comments" targetId={comment.id} initialScore={comment.score} initialVote={comment.viewerVote ?? 0}/>
      <div className="comment-copy">
        <header><strong>{comment.author?.display_name ?? comment.author?.handle ?? "Deleted member"}</strong><span>{new Date(comment.createdAt).toLocaleString()}</span>{comment.removedAt && <span>Removed</span>}</header>
        <p>{comment.deletedAt ? "[deleted]" : comment.removedAt ? "[removed by moderator]" : comment.body}</p>
        {!locked && !comment.deletedAt && !comment.removedAt && <div className="comment-actions">
          <button type="button" onClick={() => setReplyTo(comment.id)}><Reply/>Reply{comment.replyCount ? ` (${comment.replyCount})` : ""}</button>
          {comment.authorId === currentUser && <button type="button" onClick={() => void remove(comment.id)}><Trash2/>Delete</button>}
          {comment.authorId !== currentUser && <DiscussionReport targetType="discussion_comment" targetId={comment.id}/>}
        </div>}
        {replyTo === comment.id && <form className="inline-reply" onSubmit={(event) => void submit(event, comment.id)}><textarea name="body" maxLength={10000} required autoFocus/><button className="button button-small button-primary" disabled={submitting}>{submitting ? "Replying…" : "Reply"}</button><button type="button" className="button button-small button-ghost" onClick={() => setReplyTo(null)}>Cancel</button></form>}
        {comment.children?.length ? render(comment.children) : null}
      </div>
    </article>);
  }

  return <section className="discussion-comments">
    <div className="section-heading"><div><span className="overline">CONVERSATION</span><h2>{commentCount} {commentCount === 1 ? "comment" : "comments"}</h2></div><MessageCircle/></div>
    {locked && <p className="discussion-notice">This post is locked. Existing comments remain visible.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <div className="center-state"><LoaderCircle className="spin"/>Loading comments…</div> : comments.length ? render(comments) : <div className="empty-state compact"><MessageCircle/><h2>No comments yet</h2><p>Start a thoughtful conversation.</p></div>}
    {!locked && <DiscussionCommentComposer
      expanded={composerExpanded}
      submitting={submitting}
      onExpand={() => setComposerExpanded(true)}
      onCancel={() => setComposerExpanded(false)}
      onSubmit={(event) => void submit(event, null)}
    />}
  </section>;
}
