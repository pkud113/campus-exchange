"use client";
import { useState } from "react";

export type ModerationIssue = { checkId: string; reviewEligible?: boolean };

export function moderationIssueFrom(result: unknown): ModerationIssue | null {
  if(!result||typeof result!=="object")return null;
  const error=(result as {error?:{code?:string;details?:unknown}}).error;
  if(!error||!["content_blocked","content_review_required"].includes(error.code??"")||!error.details||typeof error.details!=="object")return null;
  const details=error.details as {checkId?:unknown;reviewEligible?:unknown};
  return typeof details.checkId==="string"?{checkId:details.checkId,reviewEligible:details.reviewEligible===true}:null;
}

export function ModerationReviewButton({ issue, onStatus, onReviewed }: {
  issue: ModerationIssue;
  onStatus: (message: string) => void;
  onReviewed?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!issue.reviewEligible) return null;

  async function requestReview() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/moderation/content-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkId: issue.checkId, idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) {
        onStatus(result.error?.message ?? "Unable to request staff review.");
        return;
      }
      onReviewed?.();
      onStatus("Staff review requested. Your draft remains unpublished until you revise it or receive approval.");
    } catch {
      onStatus("Unable to request staff review.");
    } finally {
      setBusy(false);
    }
  }

  return <button type="button" className="button button-ghost button-small" disabled={busy} onClick={() => void requestReview()}>{busy ? "Requesting…" : "Request staff review"}</button>;
}
