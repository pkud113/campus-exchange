"use client";

import { RefreshCcw, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { SocialPostCard } from "@/components/social/social-post-card";
import type { SocialPostView } from "@/lib/social";

type Scope = "for_you" | "campus" | "friends" | "network";
const filterCopy: Record<Scope, { label: string; empty: string }> = {
  for_you: { label: "For you", empty: "No visible community posts yet" },
  campus: { label: "Campus", empty: "Your campus has not posted yet" },
  friends: { label: "Friends", empty: "No posts from friends yet" },
  network: { label: "Network", empty: "No network posts yet" },
};

export function SocialFeed({ initialScope = "for_you", networkEnabled = true }: { initialScope?: Scope; networkEnabled?: boolean }) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [posts, setPosts] = useState<SocialPostView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const filters = (Object.keys(filterCopy) as Scope[]).filter((item) => item !== "network" || networkEnabled);

  const load = useCallback(async (selected: Scope, nextCursor?: string) => {
    if (nextCursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    const query = new URLSearchParams({ scope: selected, limit: "20" }); if (nextCursor) query.set("cursor", nextCursor);
    try {
      const response = await fetch(`/api/v1/social/posts?${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to load the social feed.");
      setPosts((items) => nextCursor ? [...items, ...result.data.items] : result.data.items);
      setCursor(result.data.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load the social feed."); }
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { void load(scope); window.history.replaceState(null, "", scope === "for_you" ? "/social" : `/social?scope=${scope}`); }, [load, scope]);

  function onFilterKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? filters.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + filters.length) % filters.length;
    const selected = filters[next]; if (selected) { setScope(selected); document.getElementById(`social-filter-${selected}`)?.focus(); }
  }

  return <div className="social-discovery-layout">
    <nav className="social-feed-filters" aria-label="Social feed filters" role="tablist">{filters.map((filter, index) => <button id={`social-filter-${filter}`} key={filter} role="tab" aria-selected={scope === filter} tabIndex={scope === filter ? 0 : -1} onKeyDown={(event) => onFilterKey(event, index)} onClick={() => setScope(filter)}>{filterCopy[filter].label}</button>)}</nav>
    <section className="social-feed" aria-busy={loading || loadingMore} aria-live="polite" aria-label={`${filterCopy[scope].label} social posts`}>
      {loading && <div className="social-feed-skeleton">{[1, 2, 3].map((item) => <Skeleton className="social-post-skeleton" key={item} />)}</div>}
      {!loading && error && <ErrorState title="Social could not load" description={error} action={<Button onClick={() => load(scope)}><RefreshCcw /> Try again</Button>} />}
      {!loading && !error && !posts.length && <EmptyState icon={<UsersRound />} title={filterCopy[scope].empty} description="Visible updates from verified students and organizations will appear here." />}
      {!loading && !error && posts.map((post) => <SocialPostCard initialPost={post} networkEnabled={networkEnabled} key={post.id} onDeleted={(id) => setPosts((items) => items.filter((item) => item.id !== id))} />)}
      {!loading && !error && cursor && <div className="social-load-more"><Button variant="secondary" busy={loadingMore} onClick={() => load(scope, cursor)}>Load more posts</Button></div>}
    </section>
  </div>;
}
