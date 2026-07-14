"use client";
import { Ban } from "lucide-react";
import { useState } from "react";
export function BlockButton({
  profileId,
  initialBlocked,
}: {
  profileId: string;
  initialBlocked: boolean;
}) {
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    setBusy(true);
    setError("");
    const desired = !blocked;
    const init: RequestInit = { method: desired ? "POST" : "DELETE" };
    if (desired) {
      init.headers = { "content-type": "application/json" };
      init.body = "{}";
    }
    const response = await fetch(`/api/v1/blocks/${profileId}`, init);
    if (response.ok) setBlocked(desired);
    else setError("Unable to update this block.");
    setBusy(false);
  }
  return (
    <div className="profile-block-action">
      <button
        type="button"
        className="button button-ghost"
        disabled={busy}
        onClick={toggle}
      >
        <Ban />
        {blocked ? "Unblock" : "Block"}
      </button>
      {error && (
        <small className="form-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
