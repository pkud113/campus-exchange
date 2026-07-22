import { CalendarDays, ShoppingBag, UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FriendRequestButton } from "@/components/friend-request-button";
import { ListingCard } from "@/components/listing-card";
import { MessageRequestComposer } from "@/components/message-request-composer";
import { ProfilePosts } from "@/components/profile/profile-posts";
import { ProfileTabNav, profileTabs, type ProfileTabId } from "@/components/profile/profile-tab-nav";
import { EmptyState, SectionHeader, SurfaceCard } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { encodeCursor } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hydrateSocialPosts, type SocialPostRow } from "@/lib/social";
import { BlockButton } from "./block-button";

function activeTab(value?: string): ProfileTabId { return profileTabs.some((tab) => tab.id === value) ? value as ProfileTabId : "posts"; }

export default async function PublicProfile({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string; compose?: string }> }) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const tab = activeTab(query.tab);
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/u/${username}`)}`);
  const { data: profileRows } = await db.rpc("safe_profile_by_username", { target_username: username.toLowerCase() });
  const profile = profileRows?.[0]; if (!profile) notFound();
  const own = profile.id === user.id;
  const displayName = profile.display_name ?? profile.handle;
  const [{ count: blockCount }, { data: networkEnabled }] = await Promise.all([
    own ? Promise.resolve({ count: 0 }) : db.from("blocks").select("blocked_id", { count: "exact", head: true }).eq("blocker_id", user.id).eq("blocked_id", profile.id),
    db.rpc("network_features_enabled"),
  ]);

  let panel: React.ReactNode;
  if (tab === "posts") {
    const { data } = await db.rpc("social_feed_filtered", { before_created: null, before_id: null, result_limit: 21, selected_scope: "for_you", target_author: profile.id });
    const rows = (data ?? []) as SocialPostRow[];
    const page = rows.slice(0, 20);
    const posts = await hydrateSocialPosts(db, user.id, page);
    const last = page.at(-1);
    panel = <ProfilePosts profileId={profile.id} own={own} displayName={displayName} initialPosts={posts} initialCursor={rows.length > 20 && last ? encodeCursor(last.created_at, last.id) : null} networkEnabled={networkEnabled !== false} compose={own && query.compose === "1"} />;
  } else if (tab === "listings") {
    const [{ data: listings }, { data: favorites }] = await Promise.all([
      db.from("listings").select("id,title,category,condition,price_cents,currency,visibility,exchange_methods,legacy_exchange_unspecified,campuses!inner(name,short_name)").eq("seller_id", profile.id).eq("status", "active").is("deleted_at", null).order("created_at", { ascending: false }).limit(12),
      db.from("favorites").select("listing_id"),
    ]);
    const { data: listingMedia } = listings?.length ? await db.rpc("safe_listing_media", { target_ids: listings.map((listing) => listing.id) }) : { data: [] };
    const favoriteIds = new Set((favorites ?? []).map((item) => item.listing_id));
    const seller = { handle: profile.handle, display_name: profile.display_name, avatar_media_id: profile.avatar_media_id, campus_name: profile.campus_name, campus_short_name: profile.campus_short_name };
    panel = <section className="profile-activity-section"><SectionHeader eyebrow="MARKETPLACE" title={own ? "Your active listings" : `${displayName} is selling`} description="Items currently available to you." action={own ? <Link href="/my/listings">Manage all</Link> : undefined} />{listings?.length ? <div className="listing-grid">{listings.map((item) => <ListingCard key={item.id} listing={{ ...item, profiles: seller, media_uploads: (listingMedia ?? []).filter((media: { listing_id: string }) => media.listing_id === item.id) } as never} initialFavorite={favoriteIds.has(item.id)} />)}</div> : <EmptyState icon={<ShoppingBag />} title="No active listings" description={own ? "Create or publish a listing to show it on your profile." : "No active listings are visible to you."} action={own ? <Link className="button button-primary" href="/sell">Create listing</Link> : undefined} />}</section>;
  } else if (tab === "events") {
    const { data: events } = await db.from("events").select("id,title,location,starts_at,visibility,campuses!inner(name,short_name)").eq("organizer_id", profile.id).is("deleted_at", null).is("cancelled_at", null).gte("starts_at", new Date().toISOString()).order("starts_at").limit(12);
    panel = <section className="profile-activity-section"><SectionHeader eyebrow="EVENTS" title={own ? "Your upcoming events" : `${displayName} is organizing`} description="Upcoming events available to you." action={own ? <Link href="/my/events">Manage all</Link> : undefined} />{events?.length ? <div className="profile-event-grid">{events.map((event) => <SurfaceCard as="article" className="profile-event-card surface-card-subtle" key={event.id}><span className="compact-date"><strong>{new Date(event.starts_at).getDate()}</strong><small>{new Date(event.starts_at).toLocaleString("en-US", { month: "short" })}</small></span><div><h3>{event.title}</h3><p>{new Date(event.starts_at).toLocaleString()} · {event.location}</p></div><Link href={`/events?event=${event.id}`}>View event</Link></SurfaceCard>)}</div> : <EmptyState icon={<CalendarDays />} title="No upcoming events" description={own ? "Events you organize will appear here." : "No upcoming events are visible to you."} action={own ? <Link className="button button-primary" href="/events/new">Create event</Link> : undefined} />}</section>;
  } else if (tab === "organizations") {
    const { data: memberships } = await db.from("organization_memberships").select("role,organization_id,organizations(id,slug,name,description,avatar_media_id,visibility,status,member_count)").eq("profile_id", profile.id).eq("status", "active").order("joined_at", { ascending: false }).limit(24);
    panel = <section className="profile-activity-section"><SectionHeader eyebrow="ORGANIZATIONS" title={own ? "Your organizations" : `${displayName} participates in`} description="Active campus and network memberships visible to you." action={<Link href="/organizations">Discover groups</Link>} />{memberships?.length ? <div className="profile-organization-grid">{memberships.map((membership) => { const organization = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations; if (!organization) return null; return <Link className="profile-organization-card surface-card surface-card-subtle" href={`/organizations/${organization.slug}`} key={membership.organization_id}><UserAvatar name={organization.name} mediaId={organization.avatar_media_id} /><div><strong>{organization.name}</strong><p>{organization.description}</p><small>{membership.role} · {organization.member_count} members</small></div></Link>; })}</div> : <EmptyState icon={<UsersRound />} title="No visible organizations" description={own ? "Join or create a student organization to show it here." : "No organization memberships are visible to you."} action={own ? <Link className="button button-primary" href="/organizations">Explore organizations</Link> : undefined} />}</section>;
  } else {
    panel = <section className="profile-about-grid"><SurfaceCard as="section" className="profile-about-main surface-card-subtle"><SectionHeader eyebrow="ABOUT" title={`About ${displayName}`} />{profile.bio ? <p className="profile-about-bio">{profile.bio}</p> : <p className="profile-muted-copy">No biography has been added.</p>}<dl>{profile.academic_field && <div><dt>Academic field</dt><dd>{profile.academic_field}</dd></div>}{profile.graduation_year && <div><dt>Graduation</dt><dd>{profile.graduation_year}</dd></div>}<div><dt>Campus</dt><dd>{profile.campus_name}</dd></div><div><dt>Joined</dt><dd>{new Date(profile.joined_month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</dd></div></dl></SurfaceCard><SurfaceCard as="section" className="profile-interest-card surface-card-accent"><SectionHeader eyebrow="INTERESTS" title="Campus interests" />{profile.interests?.length ? <div className="profile-interest-list">{profile.interests.map((interest: string) => <span key={interest}>{interest}</span>)}</div> : <p className="profile-muted-copy">No interests have been shared.</p>}{own && <Link href="/settings">Edit profile details</Link>}</SurfaceCard></section>;
  }

  return <main className="dashboard narrow profile-page">
    <section className="public-profile profile-hero">
      <div className="public-profile-banner">{profile.banner_media_id && <img src={`/api/v1/media/${profile.banner_media_id}?variant=full`} alt="" />}</div>
      <div className="public-profile-heading"><UserAvatar name={displayName} mediaId={profile.avatar_media_id} size="profile" /><div><span className="overline">{profile.same_campus ? "YOUR CAMPUS" : "CAMPUS EXCHANGE NETWORK"}</span><h1>{displayName}</h1><p>@{profile.handle} · {profile.campus_name}</p></div>{!own ? <div className="profile-actions"><FriendRequestButton profileId={profile.id} /><MessageRequestComposer profileId={profile.id} username={profile.handle} campus={profile.campus_name} /><BlockButton profileId={profile.id} initialBlocked={(blockCount ?? 0) > 0} /></div> : <Link className="button button-ghost" href="/settings">Edit profile</Link>}</div>
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}
    </section>
    <ProfileTabNav active={tab} />
    <section id={`profile-panel-${tab}`} role="tabpanel" aria-labelledby={`profile-tab-${tab}`} tabIndex={0} className="profile-tab-panel">{panel}</section>
  </main>;
}
