"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EventForm({ organization }: { organization?: { id: string; name: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const capacity = String(form.get("capacity") ?? "").trim();
    const response = await fetch("/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        location: form.get("location"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(),
        capacity: capacity ? Number(capacity) : null,
        visibility: form.get("visibility"),
        organizationId: organization?.id ?? null,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Unable to create event.");
      setBusy(false);
      return;
    }
    router.push(`/events?event=${body.data.id}#event-${body.data.id}`);
    router.refresh();
  }

  return (
    <form className="listing-form" onSubmit={submit}>
      <section>
        <h2>Event details</h2>
        {organization && <p className="form-notice">Creating for <strong>{organization.name}</strong>. Organization permissions are checked when you publish.</p>}
        <label>Title<input name="title" minLength={3} maxLength={120} placeholder="e.g. Saturday pickup soccer" required /></label>
        <label>Description<textarea name="description" minLength={10} maxLength={5000} rows={5} placeholder="What is happening, and who should come?" required /></label>
        <label>Location<input name="location" minLength={2} maxLength={200} placeholder="Actual event location" required /></label>
        <div className="form-row">
          <label>Starts<input name="startsAt" type="datetime-local" required /></label>
          <label>Ends<input name="endsAt" type="datetime-local" required /></label>
        </div>
        <label>Capacity (optional)<input name="capacity" type="number" min="1" max="10000" /></label>
        <fieldset className="choice-fieldset">
          <legend>Who can see this event?</legend>
          <label><input type="radio" name="visibility" value="campus_only" defaultChecked /> My campus only</label>
          <label><input type="radio" name="visibility" value="network" /> All Campus Exchange campuses</label>
        </fieldset>
        <p className="form-notice">Student-created events are not endorsed by the organizer’s university.</p>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <Link className="button button-ghost" href="/events">Cancel</Link>
        <button className="button button-primary" disabled={busy}>{busy ? "Publishing…" : "Publish event"}</button>
      </div>
    </form>
  );
}
