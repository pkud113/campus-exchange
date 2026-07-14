"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CommunityDeleteButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function remove() {
    const reason = window.prompt("Why is this community being deleted? Its slug remains reserved.");
    if (!reason || reason.trim().length < 3 || !window.confirm("Delete this community? Participation stops immediately and content cleanup begins after 30 days.")) return;
    const response = await fetch(`/api/v1/discussions/communities/${slug}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
    const result = await response.json();
    if (response.ok) { router.push("/discussions"); router.refresh(); }
    else setError(result.error?.message ?? "Unable to delete the community.");
  }
  return <div><button type="button" className="button button-danger" onClick={() => void remove()}>Delete community</button>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
