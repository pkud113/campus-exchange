"use client";

import { LoaderCircle, MessageCircle, Reply, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DiscussionVote } from "./discussion-vote";
import { DiscussionReport } from "./discussion-report";

type CommentNode = {
  id: string;
  authorId: string | null;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  score: number;
  replyCount: number;
  removedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  viewerVote?: -1 | 0 | 1;
  children?: CommentNode[];
  author?: { handle?: string; display_name?: string };
};

export function CommentsClient({ postId, currentUser, locked = false }: { postId: string; currentUser: string; locked?: boolean }) {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/discussions/posts/${postId}/comments`);
    const result = await response.json();
    if (response.ok) setComments(result.data.comments ?? []);
    else setError(result.error?.message ?? "Unable to load comments.");
    setLoading(false);
  }, [postId]);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/discussions/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: form.get("body"), parentCommentId: replyTo, idempotencyKey: key.current })
    });
    const result = await response.json();
    if (response.ok) {
      key.current = crypto.randomUUID();
      setReplyTo(null);
      event.currentTarget.reset();
      await load();
    } else setError(result.error?.message ?? "Unable to add comment.");
  }

  async function remove(id: string) {
    const response = await fetch(`/api/v1/discussions/comments/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Author deleted comment" })
    });
    if (response.ok) await load();
  }

  function render(nodes: CommentNode[]): React.ReactNode {
    return nodes.map((comment) => <article className="discussion-comment" style={{ "--comment-depth": Math.min(comment.depth, 4) } as React.CSSProperties} key={comment.id}>
      <div className="comment-line"/>
      <DiscussionVote targetType="comments" targetId={comment.id} initialScore={comment.score} initialVote={comment.viewerVote ?? 0}/>
      <div className="comment-copy">
        <header><strong>{comment.author?.display_name ?? comment.author?.handle ?? "Deleted member"}</strong><span>{new Date(comment.createdAt).toLocaleString()}</span>{comment.removedAt && <span>Removed</span>}</header>
        <p>{comment.deletedAt ? "[deleted]" : comment.removedAt ? "[removed by moderator]" : comment.body}</p>
        {!locked && !comment.deletedAt && !comment.removedAt && <div className="comment-actions">
          <button type="button" onClick={() => setReplyTo(comment.id)}><Reply/>Reply</button>
          {comment.authorId === currentUser && <button type="button" onClick={() => void remove(comment.id)}><Trash2/>Delete</button>}
          {comment.authorId !== currentUser && (
            <DiscussionReport targetType="discussion_comment" targetId={comment.id}/>
          )}
        </div>}
        {replyTo === comment.id && <form className="inline-reply" onSubmit={submit}><textarea name="body" maxLength={10000} required autoFocus/><button className="button button-small button-primary">Reply</button><button type="button" className="button button-small button-ghost" onClick={() => setReplyTo(null)}>Cancel</button></form>}
        {comment.children?.length ? render(comment.children) : null}
      </div>
    </article>);
  }

  return <section className="discussion-comments">
    <div className="section-heading"><div><span className="overline">CONVERSATION</span><h2>Comments</h2></div><MessageCircle/></div>
    {!locked && <form className="comment-composer" onSubmit={submit}><textarea name="body" maxLength={10000} placeholder="Add to the discussion…" required/><button className="button button-primary">Comment</button></form>}
    {locked && <p className="discussion-notice">This post is locked. Existing comments remain visible.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <div className="center-state"><LoaderCircle className="spin"/>Loading comments…</div> : comments.length ? render(comments) : <div className="empty-state compact"><MessageCircle/><h2>No comments yet</h2><p>Start a thoughtful conversation.</p></div>}
  </section>;
}
