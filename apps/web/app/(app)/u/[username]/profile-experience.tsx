"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, Grid3X3, Info, Plus, ShoppingBag, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { ProfileTabNav } from "@/components/profile/profile-tab-nav";
import type { ProfileTabId as Tab } from "@/components/profile/profile-tabs";

type Profile = { handle: string; display_name: string | null; bio: string; academic_field: string | null; graduation_year: number | null; interests: string[]; campus_name: string; joined_month: string; post_count: number; friend_count: number; organization_count: number; listing_count: number; event_count: number; mutual_friend_count: number; organization_memberships_visible: boolean; activity_visible: boolean };
type Item = Record<string, any>;

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "posts", label: "Posts", icon: <Grid3X3 /> },
  { id: "listings", label: "Listings", icon: <ShoppingBag /> },
  { id: "events", label: "Events", icon: <CalendarDays /> },
  { id: "organizations", label: "Organizations", icon: <UsersRound /> },
  { id: "about", label: "About", icon: <Info /> },
];

export function ProfileExperience({ profile, own, initialTab, postsPanel }: { profile: Profile; own: boolean; initialTab: Tab; postsPanel: ReactNode }) {
  const [tab, setTab] = useState<Tab>(initialTab); const [items, setItems] = useState<Item[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [loading, setLoading] = useState(initialTab !== "posts"); const [error, setError] = useState("");
  const load = useCallback(async (chosen: Tab, cursor?: string | null) => {
    setLoading(true); setError(""); const params = new URLSearchParams({ tab: chosen, limit: chosen === "posts" ? "18" : "12" }); if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/v1/profiles/${profile.handle}/content?${params}`); const json = await response.json();
    if (response.ok) { setItems((current) => cursor ? [...current, ...json.data.items] : json.data.items); setNextCursor(json.data.nextCursor); }
    else { setError(json.error?.message ?? "Unable to load this profile section."); if (!cursor) setItems([]); }
    setLoading(false);
  }, [profile.handle]);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => {
    setItems([]); setNextCursor(null);
    if (tab === "posts") { setLoading(false); setError(""); return; }
    void load(tab);
  }, [load, tab]);

  return <section className="profile-content">
    <ProfileTabNav active={tab} />
    <div id={`profile-panel-${tab}`} role="tabpanel" aria-labelledby={`profile-tab-${tab}`} tabIndex={0} className="profile-tab-panel">
    <header className="profile-tab-header"><div><h2>{tabs.find((item) => item.id === tab)?.label}</h2><p>{tab === "posts" ? "Create and manage personal updates from your profile" : tab === "listings" ? "Marketplace activity" : tab === "events" ? "Hosted organization and student events" : tab === "organizations" ? "Visible campus memberships and leadership" : "Student identity and campus context"}</p></div>{own && tab === "listings" && <Link className="button button-primary button-small" href="/sell"><Plus /> Create listing</Link>}{own && tab === "events" && <Link className="button button-primary button-small" href="/events/new"><Plus /> Create event</Link>}</header>
    {error && <div className="ui-alert ui-alert-error" role="alert"><p>{error}</p><button onClick={() => load(tab)}>Try again</button></div>}
    {loading && !items.length && <div className="profile-tab-loading" aria-live="polite">Loading {tab}…</div>}
    {!loading && !items.length && tab !== "posts" && tab !== "about" && tab !== "organizations" && <EmptyState icon={tab === "listings" ? <ShoppingBag /> : <CalendarDays />} title={`No ${tab} to show`} description={own ? `Your ${tab} will appear here when you add them.` : `This student has no visible ${tab}.`} />}
    {tab === "posts" && postsPanel}
    {tab === "listings" && <div className="listing-grid profile-listing-grid">{items.map((listing) => <div className="profile-listing-item" key={listing.id}><ListingCard listing={{ ...listing, profiles: { handle: profile.handle, display_name: profile.display_name, campus_name: profile.campus_name }, media_uploads: listing.media } as never} initialFavorite={false} />{own && <span className={`ui-badge listing-state-${listing.status}`}>{listing.status}</span>}</div>)}</div>}
    {tab === "events" && <div className="profile-event-list">{items.map((event) => { const now = Date.now(); const state = event.cancelled_at ? "Cancelled" : new Date(event.ends_at).getTime() < now ? "Past" : "Upcoming"; return <Link href={`/events?event=${event.id}`} key={event.id}><CalendarDays /><div><strong>{event.title}</strong><span>{new Date(event.starts_at).toLocaleString()} · {event.location}</span></div><em data-state={state.toLowerCase()}>{state}</em></Link>; })}</div>}
    {tab === "organizations" && profile.organization_memberships_visible && items.length > 0 && <div className="profile-organization-list">{items.map((organization) => <Link href={`/organizations/${organization.slug}`} key={organization.id}><span className="organization-mark">{organization.avatar_media_id ? <img src={`/api/v1/media/${organization.avatar_media_id}?variant=thumb`} alt="" /> : <UsersRound />}</span><span><strong>{organization.name}</strong><small>{organization.role === "owner" ? "Owner" : organization.role === "administrator" ? "Administrator" : organization.role}</small></span><em>{organization.member_count} members</em></Link>)}</div>}
    {tab === "organizations" && !loading && profile.organization_memberships_visible && !items.length && <EmptyState icon={<UsersRound />} title="No organizations to show" description={own ? "Organizations you join will appear here." : "This student has no visible organization memberships."} />}
    {tab === "organizations" && !profile.organization_memberships_visible && <EmptyState icon={<UsersRound />} title="Organizations are private" description="This student does not share organization memberships with you." />}
    {tab === "about" && <div className="profile-about-grid"><section><h3>About</h3><p>{profile.bio || "No biography added."}</p><dl><div><dt>Campus</dt><dd>{profile.campus_name}</dd></div>{profile.academic_field && <div><dt>Field of study</dt><dd>{profile.academic_field}</dd></div>}{profile.graduation_year && <div><dt>Graduation year</dt><dd>{profile.graduation_year}</dd></div>}<div><dt>Joined</dt><dd>{new Date(profile.joined_month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</dd></div></dl></section><section><h3><UsersRound /> Campus connections</h3><p>{profile.friend_count} friends · {profile.mutual_friend_count} mutual friends</p><div className="profile-interest-list">{profile.interests.map((interest) => <span key={interest}>{interest}</span>)}</div></section><section className="profile-verification-context"><CheckCircle2 /><div><h3>Verified student</h3><p>Campus Exchange verified this account through an approved school-email flow. Private email details are never shown.</p></div></section></div>}
    {nextCursor && <button className="button button-ghost profile-load-more" disabled={loading} onClick={() => load(tab, nextCursor)}>{loading ? "Loading…" : "Load more"}</button>}
    </div>
  </section>;
}
