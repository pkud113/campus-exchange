import {
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  Heart,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { ListingCard, type ListingCardItem } from "@/components/listing-card";
import { UserAvatar } from "@/components/user-avatar";
import { PageHeader, SectionHeader, SurfaceCard } from "@/components/ui";
import { loadEvents, loadListings } from "@/lib/loaders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Home" };

type InboxRow = {
  id: string;
  other_handle: string;
  other_display_name: string | null;
  other_avatar_id: string | null;
  latest_body: string | null;
  listing_title: string | null;
  unread_count: number | string;
};

export default async function Home() {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/home");

  const [
    listings,
    events,
    profileResult,
    notificationsResult,
    unreadNotificationsResult,
    favoritesResult,
    inboxResult,
  ] = await Promise.all([
    loadListings({ limit: 8 }),
    loadEvents(),
    db.from("profiles").select("display_name,handle,campuses(name)").eq("id", user.id).single(),
    db.from("notifications").select("id,title,body,href,created_at,read_at").order("created_at", { ascending: false }).limit(5),
    db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    db.from("favorites").select("listing_id,created_at").eq("profile_id", user.id).order("created_at", { ascending: false }).limit(8),
    db.rpc("conversation_inbox"),
  ]);

  const favoriteIds = (favoritesResult.data ?? []).map((item) => item.listing_id);
  const saved = favoriteIds.length
    ? await db
        .from("listings")
        .select("id,title,category,condition,price_cents,currency,created_at,profiles!listings_seller_id_fkey(handle,display_name,avatar_media_id),media_uploads(id,alt_text,status)")
        .in("id", favoriteIds)
        .is("deleted_at", null)
    : { data: [] };
  const inbox = (inboxResult.data ?? []) as InboxRow[];
  const unreadMessages = inbox.reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0);
  const unreadNotifications = unreadNotificationsResult.count ?? 0;
  const campusValue = profileResult.data?.campuses;
  const campus = Array.isArray(campusValue) ? campusValue[0] : campusValue;
  const campusName = campus?.name ?? "Your campus";
  const firstName = (profileResult.data?.display_name ?? profileResult.data?.handle ?? "there").split(" ")[0];
  const stats = [
    { href: "/messages", label: "Unread messages", value: unreadMessages, Icon: MessageCircle },
    { href: "/notifications", label: "New notifications", value: unreadNotifications, Icon: Bell },
    { href: "#saved", label: "Saved listings", value: favoriteIds.length, Icon: Heart },
    { href: "/events", label: "Upcoming events", value: events.length, Icon: CalendarDays },
  ];

  return (
    <main className="dashboard home-dashboard">
      <PageHeader
        eyebrow="YOUR CAMPUS EXCHANGE"
        title={<>Good to see you, {firstName}.</>}
        description="Everything happening around your campus, organized in one place."
        meta={<span className="campus-identity"><Building2 /> {campusName}<ShieldCheck /> Verified</span>}
        actions={
          <div className="home-actions">
            <Link className="button button-primary" href="/sell"><Plus /> Create listing</Link>
            <Link className="button button-ghost" href="/events/new"><CalendarDays /> Create event</Link>
          </div>
        }
      />

      <form className="dashboard-search" action="/marketplace">
        <Search aria-hidden="true" />
        <input name="q" aria-label="Search marketplace" placeholder="Search listings across your campus" />
        <button type="submit">Search marketplace</button>
      </form>

      <section className="dashboard-summary" aria-label="Campus activity summary">
        {stats.map(({ href, label, value, Icon }) => (
          <Link href={href} key={label}>
            <span className="summary-icon"><Icon /></span>
            <span className="summary-copy"><small>{label}</small><strong>{value}</strong></span>
            <ChevronRight className="summary-arrow" />
          </Link>
        ))}
      </section>

      <div className="home-layout">
        <div className="home-feed">
          <SurfaceCard className="feed-section">
            <SectionHeader eyebrow="MARKETPLACE" title="Fresh around campus" description="The newest listings from verified campus members." action={<Link href="/marketplace">See all <ChevronRight /></Link>} />
            {listings.length ? (
              <div className="listing-grid home-listing-grid">
                {listings.map((item) => <ListingCard key={item.id} listing={item as ListingCardItem} />)}
              </div>
            ) : (
              <div className="empty-state compact"><ShoppingBag /><h2>No active listings yet</h2><p>New campus listings will appear here.</p></div>
            )}
          </SurfaceCard>

          <SurfaceCard className="feed-section" id="saved">
            <SectionHeader eyebrow="SAVED ITEMS" title="Your favorites" description="Listings you saved for another look." action={<Heart />} />
            {saved.data?.length ? (
              <div className="listing-grid home-listing-grid">
                {saved.data.map((item) => <ListingCard key={item.id} listing={item as ListingCardItem} initialFavorite />)}
              </div>
            ) : (
              <div className="empty-state compact"><Heart /><h2>Nothing saved yet</h2><p>Favorite marketplace items to keep them close.</p><Link href="/marketplace">Explore listings</Link></div>
            )}
          </SurfaceCard>
        </div>

        <aside className="home-rail">
          <SurfaceCard className="rail-panel">
            <SectionHeader title="Recent conversations" action={<Link href="/messages">View all</Link>} />
            {inbox.length ? (
              <div className="activity-list">
                {inbox.slice(0, 4).map((conversation) => {
                  const name = conversation.other_display_name ?? conversation.other_handle;
                  return (
                    <Link href={`/messages?conversation=${conversation.id}`} key={conversation.id}>
                      <UserAvatar name={name} mediaId={conversation.other_avatar_id} />
                      <span><strong>{name}</strong><small>{conversation.latest_body ?? conversation.listing_title ?? "Conversation ready"}</small></span>
                      {Number(conversation.unread_count) > 0 && <b className="nav-badge">{conversation.unread_count}</b>}
                    </Link>
                  );
                })}
              </div>
            ) : <div className="empty-state compact"><MessageCircle /><p>No conversations yet.</p></div>}
          </SurfaceCard>

          <SurfaceCard className="rail-panel">
            <SectionHeader title="Upcoming events" action={<Link href="/events">View all</Link>} />
            {events.length ? (
              <div className="activity-list event-activity-list">
                {events.slice(0, 4).map((event) => (
                  <Link href="/events" key={event.id}>
                    <span className="compact-date"><strong>{new Date(event.starts_at).getDate()}</strong><small>{new Date(event.starts_at).toLocaleString("en-US", { month: "short" })}</small></span>
                    <span><strong>{event.title}</strong><small>{event.location}</small></span>
                  </Link>
                ))}
              </div>
            ) : <div className="empty-state compact"><CalendarDays /><p>No upcoming events.</p></div>}
          </SurfaceCard>

          <SurfaceCard className="rail-panel">
            <SectionHeader title="Recent activity" action={<Link href="/notifications">View all</Link>} />
            {notificationsResult.data?.length ? (
              <div className="activity-list notification-activity-list">
                {notificationsResult.data.map((item) => (
                  <Link href={item.href ?? "/notifications"} key={item.id}>
                    <span className={`activity-icon${item.read_at ? "" : " unread"}`}><Bell /></span>
                    <span><strong>{item.title}</strong><small>{item.body}</small></span>
                  </Link>
                ))}
              </div>
            ) : <div className="empty-state compact"><Bell /><p>No recent activity.</p></div>}
          </SurfaceCard>
        </aside>
      </div>
    </main>
  );
}
