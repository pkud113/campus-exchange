"use client";

import type { FriendBoxCounts, FriendBoxItem } from "@campus-exchange/shared-types";
import { UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, SurfaceCard } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";

type BoxName = "all" | "incoming" | "sent";

const emptyCounts: FriendBoxCounts = { all: 0, incoming: 0, sent: 0 };

export function FriendsClient() {
  const [box, setBox] = useState<BoxName>("all");
  const [rows, setRows] = useState<FriendBoxItem[]>([]);
  const [counts, setCounts] = useState(emptyCounts);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams({ box, limit: "20" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/v1/friends?${params}`);
    const json = await response.json();
    if (response.ok) {
      const result = json.data ?? { items: [], counts: emptyCounts, nextCursor: null };
      setRows((current) => cursor ? [...current, ...result.items] : result.items);
      setCounts(result.counts);
      setNextCursor(result.nextCursor);
    } else {
      setNotice(json.error?.message ?? "Unable to load friends.");
    }
    setLoading(false);
  }, [box]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(row: FriendBoxItem, action: string) {
    const response = await fetch(`/api/v1/friends/${row.profile.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, idempotencyKey: crypto.randomUUID() })
    });
    const json = await response.json();
    setNotice(response.ok ? "Friendship updated." : json.error?.message ?? "Unable to update friendship.");
    if (response.ok) await load();
  }

  return <section aria-busy={loading}>
    <div className="request-tabs" role="tablist" aria-label="Friend views">
      {(["all", "incoming", "sent"] as const).map((name) => <button
        key={name}
        role="tab"
        aria-selected={box === name}
        className={box === name ? "active" : ""}
        onClick={() => setBox(name)}
      >
        {name === "all" ? "All friends" : name === "incoming" ? "Incoming" : "Sent"} ({counts[name]})
      </button>)}
    </div>
    <div className="people-grid">
      {!loading && !rows.length && <EmptyState
        icon={<UsersRound />}
        title={box === "all" ? "Your friend list is ready" : `No ${box} requests`}
        description={box === "all"
          ? "Find verified students in People and send a friend request."
          : "New requests will appear here with server-derived counts."}
        action={box === "all" ? <Link className="button button-primary" href="/people"><UserPlus />Find people</Link> : undefined}
      />}
      {rows.map((row) => <SurfaceCard className="friend-card" key={row.relationshipId}>
        <UserAvatar
          name={row.profile.displayName ?? row.profile.username ?? "Campus member"}
          mediaId={row.profile.avatarMediaId}
          size="large"
        />
        <div>
          <Link href={`/u/${row.profile.username}`}><strong>{row.profile.displayName ?? row.profile.username}</strong></Link>
          <small>@{row.profile.username} · {row.profile.campus.shortName}</small>
          {row.profile.mutualFriendCount ? <span className="ui-badge">
            {row.profile.mutualFriendCount} mutual {row.profile.mutualFriendCount === 1 ? "friend" : "friends"}
          </span> : null}
          {row.mutualPreview.length ? <div className="mutual-preview" aria-label="Mutual friends">
            {row.mutualPreview.map((mutual) => <UserAvatar
              key={mutual.id}
              name={mutual.displayName ?? mutual.username}
              mediaId={mutual.avatarMediaId}
              size="small"
            />)}
          </div> : null}
        </div>
        <div className="friend-actions">
          {row.direction === "incoming" && <>
            <button className="button button-primary button-small" onClick={() => act(row, "accept")}>Accept</button>
            <button className="button button-ghost button-small" onClick={() => act(row, "decline")}>Decline</button>
          </>}
          {row.direction === "sent" && <button className="button button-ghost button-small" onClick={() => act(row, "cancel")}>Cancel</button>}
          {row.direction === "friend" && <button className="button button-ghost button-small" onClick={() => act(row, "remove")}>Remove</button>}
        </div>
      </SurfaceCard>)}
    </div>
    {nextCursor && <button className="button button-ghost" disabled={loading} onClick={() => load(nextCursor)}>
      {loading ? "Loading…" : "Load more"}
    </button>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
  </section>;
}
