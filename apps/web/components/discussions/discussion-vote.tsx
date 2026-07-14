"use client";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { useState } from "react";

export function DiscussionVote({ targetType, targetId, initialScore, initialVote = 0 }: { targetType: "posts" | "comments"; targetId: string; initialScore: number; initialVote?: -1 | 0 | 1 }) {
  const [score, setScore] = useState(initialScore); const [vote, setVote] = useState<-1 | 0 | 1>(initialVote); const [busy, setBusy] = useState(false);
  async function choose(selected: -1 | 1) {
    if (busy) return; const previousVote = vote; const previousScore = score; const next = vote === selected ? 0 : selected;
    setBusy(true); setVote(next); setScore(score + next - vote);
    const response = await fetch(`/api/v1/discussions/${targetType}/${targetId}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: next || null }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) { setVote(previousVote); setScore(previousScore); }
    else { setVote(result.data.value as -1 | 0 | 1); setScore(result.data.score); }
    setBusy(false);
  }
  return <div className="discussion-vote" aria-label={`Score ${score}`}><button type="button" className={vote === 1 ? "active" : ""} aria-label="Upvote" aria-pressed={vote === 1} disabled={busy} onClick={() => choose(1)}><ArrowBigUp/></button><strong>{score}</strong><button type="button" className={vote === -1 ? "active down" : ""} aria-label="Downvote" aria-pressed={vote === -1} disabled={busy} onClick={() => choose(-1)}><ArrowBigDown/></button></div>;
}
