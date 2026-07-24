"use client";

import type { NotificationCategory, NotificationCategoryPreference } from "@campus-exchange/shared-types";
import { LoaderCircle, Mail } from "lucide-react";
import { useEffect, useState } from "react";

type LegacyPreferences = {
  emailMessages: boolean;
  emailDiscussions: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
};
type Preferences = LegacyPreferences & { categories: Record<NotificationCategory, NotificationCategoryPreference> };

const labels: Record<NotificationCategory, string> = {
  friend_request: "Friend requests",
  friend_accepted: "Accepted friendships",
  message: "Messages",
  message_request: "Message requests",
  social_reaction: "Social reactions",
  social_comment: "Social comments",
  social_reply: "Social replies",
  organization_invitation: "Organization invitations",
  organization_membership: "Organization membership and channel activity",
  event_activity: "Event activity",
  discussion_activity: "Discussion activity",
  moderation_activity: "Moderation outcomes",
  security_activity: "Account security"
};

export function NotificationPreferences({ initial }: { initial: LegacyPreferences }) {
  const [value, setValue] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/notification-preferences").then(async (response) => {
      const body = await response.json();
      if (active && response.ok) setValue(body.data);
      else if (active) setNotice("Notification preferences could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!value) return;
    setBusy(true);
    setNotice("");
    const categories = Object.fromEntries(Object.entries(value.categories).map(([category, preference]) => [
      category,
      { inApp: preference.inApp, email: preference.email }
    ]));
    const response = await fetch("/api/v1/notification-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...value, categories })
    });
    setNotice(response.ok ? "Notification preferences saved." : "Notification preferences could not be saved.");
    setBusy(false);
  }

  const current = value ?? { ...initial, categories: {} as Preferences["categories"] };
  const quietEnabled = current.quietHoursStart !== null;

  return <form className="settings-form notification-preferences" onSubmit={save} aria-busy={!value || busy}>
    <Mail /><h2>Notification delivery</h2>
    <p>Choose in-app and email delivery by category. Security and moderation outcomes are always available in-app. Quiet hours use your campus&apos;s local time and suppress email.</p>
    {value && <div className="notification-category-grid" role="group" aria-label="Notification categories">
      <span>Category</span><span>In app</span><span>Email</span>
      {(Object.keys(labels) as NotificationCategory[]).map((category) => {
        const preference = value.categories[category];
        return <div className="notification-category-row" key={category}>
          <strong>{labels[category]}</strong>
          <label>
            <span className="sr-only">In-app {labels[category]}</span>
            <input
              type="checkbox"
              checked={preference.inApp}
              disabled={preference.mandatoryInApp}
              onChange={(event) => setValue({
                ...value,
                categories: { ...value.categories, [category]: { ...preference, inApp: event.target.checked } }
              })}
            />
          </label>
          <label>
            <span className="sr-only">Email {labels[category]}</span>
            <input
              type="checkbox"
              checked={preference.email}
              onChange={(event) => setValue({
                ...value,
                categories: { ...value.categories, [category]: { ...preference, email: event.target.checked } },
                emailMessages: category === "message" || category === "message_request" ? event.target.checked : value.emailMessages,
                emailDiscussions: category === "discussion_activity" ? event.target.checked : value.emailDiscussions
              })}
            />
          </label>
        </div>;
      })}
    </div>}
    <label className="check-row"><input type="checkbox" checked={quietEnabled} onChange={(event) => setValue({ ...current, quietHoursStart: event.target.checked ? 22 : null, quietHoursEnd: event.target.checked ? 7 : null })} />Use quiet hours</label>
    {quietEnabled && <div className="form-row">
      <label>Start hour (0–23)<input type="number" min={0} max={23} value={current.quietHoursStart ?? 22} onChange={(event) => setValue({ ...current, quietHoursStart: Number(event.target.value) })} /></label>
      <label>End hour (0–23)<input type="number" min={0} max={23} value={current.quietHoursEnd ?? 7} onChange={(event) => setValue({ ...current, quietHoursEnd: Number(event.target.value) })} /></label>
    </div>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <button className="button button-primary" disabled={busy || !value}>{busy ? <><LoaderCircle className="spin" /> Saving…</> : "Save notification preferences"}</button>
  </form>;
}
