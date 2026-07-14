"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function OwnershipTransfer({ slug, members }: { slug: string; members: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const [error, setError] = useState("");
  async function transfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!window.confirm("Transfer ownership? You will become a moderator and this change is audited.")) return;
    const response = await fetch(`/api/v1/discussions/communities/${slug}/ownership`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newOwnerId: form.get("newOwnerId"), reason: form.get("reason"), idempotencyKey: key.current }) });
    const result = await response.json();
    if (response.ok) { router.push(`/discussions/c/${slug}`); router.refresh(); }
    else setError(result.error?.message ?? "Unable to transfer ownership.");
  }
  return <form className="ownership-transfer" onSubmit={transfer}><h2>Transfer ownership</h2><p>The new owner must be an active member. This is atomic and cannot leave the community ownerless.</p><label>New owner<select name="newOwnerId" required><option value="">Select a member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label><label>Reason<input name="reason" minLength={3} maxLength={500} required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-danger">Transfer ownership</button></form>;
}
