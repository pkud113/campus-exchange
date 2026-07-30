"use client";

import { Scale, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, SurfaceCard } from "@/components/ui";

type Case = {
  id: string;
  entity_type: string;
  status: string;
  user_visible_resolution: string | null;
  resolved_at: string | null;
  appeal_id: string | null;
  appeal_status: string | null;
};

type ContentReview = {
  check_id: string;
  case_id: string;
  surface: string;
  operation: string;
  categories: string[];
  case_status: string;
  user_visible_resolution: string | null;
  review_requested_at: string;
  resolved_at: string | null;
  override_available: boolean;
  override_consumed_at: string | null;
  appeal_id: string | null;
  appeal_status: string | null;
};

export function AppealsClient() {
  const [cases, setCases] = useState<Case[]>([]);
  const [reviews, setReviews] = useState<ContentReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  async function load() {
    const [appealsResponse, reviewsResponse] = await Promise.all([
      fetch("/api/v1/moderation/appeals"),
      fetch("/api/v1/moderation/content-reviews"),
    ]);
    const [appealsJson, reviewsJson] = await Promise.all([
      appealsResponse.json(),
      reviewsResponse.json(),
    ]);
    if (appealsResponse.ok) setCases(appealsJson.data);
    else setNotice(appealsJson.error?.message ?? "Unable to load appeals.");
    if (reviewsResponse.ok) setReviews(reviewsJson.data);
    else setNotice(reviewsJson.error?.message ?? "Unable to load content review status.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function submit(caseId: string) {
    const value = statement[caseId]?.trim();
    if (!value || value.length < 20) return;
    const response = await fetch("/api/v1/moderation/appeals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId, statement: value, idempotencyKey: crypto.randomUUID() }),
    });
    const json = await response.json();
    setNotice(response.ok ? "Appeal submitted for independent review." : json.error?.message ?? "Unable to submit appeal.");
    if (response.ok) await load();
  }

  if (loading) return <div className="profile-tab-loading">Loading safety outcomes…</div>;
  return <section className="appeals-list">
    {reviews.length > 0 && <section id="automated-reviews" aria-labelledby="automated-reviews-title">
      <h2 id="automated-reviews-title">Content review requests</h2>
      {reviews.map((item) => <SurfaceCard id={`review-${item.case_id}`} key={item.check_id} className="appeal-card">
        <header>
          <div><span className="ui-badge">{item.case_status.replaceAll("_", " ")}</span><h3>{item.surface.replaceAll("_", " ")} {item.operation}</h3></div>
          <small>{new Date(item.review_requested_at).toLocaleString()}</small>
        </header>
        <p>{item.user_visible_resolution ?? "Your draft remains unpublished while campus safety staff review the automated decision."}</p>
        {item.override_available && <div className="success-box"><Scale /><div><strong>Approved for one resubmission</strong><p>Return to your saved draft and submit the same content once. The approval is bound to this exact content and target.</p></div></div>}
        {item.override_consumed_at && <p>Approved resubmission used {new Date(item.override_consumed_at).toLocaleString()}.</p>}
        {item.appeal_id && <p>Appeal {item.appeal_status}.</p>}
      </SurfaceCard>)}
    </section>}
    {!cases.length && !reviews.length && <EmptyState icon={<Scale />} title="No safety outcomes" description="Content reviews and appealable outcomes affecting your account will appear here." />}
    {cases.map((item) => <SurfaceCard key={item.id} className="appeal-card">
      <header><div><span className="ui-badge">{item.status}</span><h2>{item.entity_type.replaceAll("_", " ")} outcome</h2></div><small>{item.resolved_at ? new Date(item.resolved_at).toLocaleString() : "Under review"}</small></header>
      <p>{item.user_visible_resolution || "Campus Exchange safety staff completed a policy review."}</p>
      {item.appeal_id ? <div className="success-box"><Scale /><div><strong>Appeal {item.appeal_status}</strong><p>The safety team will record the outcome here. Submitting an appeal does not automatically reverse an action.</p></div></div> : <label>Appeal statement <small>Explain what was misunderstood and include relevant facts (20–4,000 characters).</small><textarea rows={5} minLength={20} maxLength={4000} value={statement[item.id] ?? ""} onChange={(event) => setStatement((values) => ({ ...values, [item.id]: event.target.value }))} /><button className="button button-primary" disabled={(statement[item.id]?.trim().length ?? 0) < 20} onClick={() => submit(item.id)}><Send /> Submit appeal</button></label>}
    </SurfaceCard>)}
    {notice && <p className="form-notice" role="status">{notice}</p>}
  </section>;
}
