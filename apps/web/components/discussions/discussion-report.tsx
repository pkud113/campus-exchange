"use client";

import { Flag } from "lucide-react";
import { useRef, useState } from "react";

export function DiscussionReport({ targetType, targetId }: { targetType: "community" | "discussion_community" | "discussion_post" | "discussion_comment"; targetId: string }) {
  const key = useRef(crypto.randomUUID());
  const [status, setStatus] = useState("");
  async function report() {
    const details = window.prompt("Briefly explain what should be reviewed.");
    if (!details?.trim()) return;
    const response = await fetch("/api/v1/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: targetType === "discussion_community" ? "community" : targetType, targetId, reason: "other", details, idempotencyKey: key.current }) });
    const result = await response.json();
    if (response.ok) setStatus("Report submitted for review.");
    else setStatus(result.error?.message ?? "Unable to submit report.");
  }
  return <div className="discussion-report"><button type="button" className="discussion-icon-action" onClick={() => void report()}><Flag/>Report</button>{status && <small role="status">{status}</small>}</div>;
}
