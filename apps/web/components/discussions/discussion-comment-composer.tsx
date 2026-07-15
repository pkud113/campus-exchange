"use client";

import { MessageCircle } from "lucide-react";
import * as React from "react";

type Props = {
  expanded: boolean;
  submitting: boolean;
  onExpand: () => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function DiscussionCommentComposer({ expanded, submitting, onExpand, onCancel, onSubmit }: Props) {
  const composerRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => {
      const composer = composerRef.current;
      if (!composer) return;
      const lastComment = composer.previousElementSibling?.lastElementChild;
      if (!(lastComment instanceof HTMLElement) || !lastComment.classList.contains("discussion-comment")) return;
      const commentRect = lastComment.getBoundingClientRect();
      const composerRect = composer.getBoundingClientRect();
      const overlap = commentRect.bottom - composerRect.top + 12;
      if (commentRect.top < window.innerHeight && commentRect.bottom > 0 && overlap > 0) {
        window.scrollBy({
          top: overlap,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  if (!expanded) {
    return (
      <button
        className="discussion-root-composer comment-composer-collapsed"
        type="button"
        aria-expanded="false"
        aria-controls="discussion-root-composer"
        onClick={onExpand}
      >
        <MessageCircle aria-hidden="true" />
        <span>Join the conversation</span>
        <strong>Comment</strong>
      </button>
    );
  }

  return (
    <form ref={composerRef} className="discussion-root-composer comment-composer expanded" id="discussion-root-composer" onSubmit={onSubmit}>
      <div className="comment-composer-heading">
        <MessageCircle aria-hidden="true" />
        <span>
          <strong>Join the conversation</strong>
          <small>Share something useful with your campus community.</small>
        </span>
      </div>
      <textarea name="body" maxLength={10000} placeholder="Add to the discussion…" aria-label="Comment text" required autoFocus />
      <div className="comment-composer-actions">
        <button type="button" className="button button-ghost" disabled={submitting} onClick={onCancel}>Cancel</button>
        <button className="button button-primary" disabled={submitting}>{submitting ? "Posting…" : "Comment"}</button>
      </div>
    </form>
  );
}
