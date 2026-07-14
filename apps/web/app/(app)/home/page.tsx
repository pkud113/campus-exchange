import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Heart,
  MessageCircle,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { ListingCard } from "@/components/listing-card";
import { loadEvents, loadListings } from "@/lib/loaders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Home" };
export default async function Home() {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
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
    loadListings({ limit: 4 }),
    loadEvents(),
    db
      .from("profiles")
      .select("display_name,handle")
      .eq("id", user.id)
      .single(),
    db
      .from("notifications")
      .select("id,title,body,href,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(4),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    db
      .from("favorites")
      .select("listing_id")
      .eq("profile_id", user.id)
      .limit(4),
    db.rpc("conversation_inbox"),
  ]);
  const favoriteIds = (favoritesResult.data ?? []).map(
    (item) => item.listing_id,
  );
  const saved = favoriteIds.length
    ? await db
        .from("listings")
        .select(
          "id,title,category,condition,price_cents,currency,profiles!listings_seller_id_fkey(handle,display_name),media_uploads(id,alt_text,status)",
        )
        .in("id", favoriteIds)
        .is("deleted_at", null)
    : { data: [] };
  const unreadMessages = (inboxResult.data ?? []).reduce(
    (sum: number, row: { unread_count?: number | string }) =>
      sum + Number(row.unread_count ?? 0),
    0,
  );
  const unreadNotifications = unreadNotificationsResult.count ?? 0;
  return (
    <main className="dashboard">
      <section className="welcome-row">
        <div>
          <span className="overline">MSU · VERIFIED CAMPUS</span>
          <h1>
            Welcome,{" "}
            {profileResult.data?.display_name ?? profileResult.data?.handle}.
          </h1>
          <p>Your campus activity, saved items, and next steps in one place.</p>
        </div>
        <div className="home-actions">
          <Link className="button button-primary" href="/sell">
            <Plus size={18} /> Create listing
          </Link>
          <Link className="button button-ghost" href="/events/new">
            <CalendarDays size={18} /> Create event
          </Link>
        </div>
      </section>
      <section className="dashboard-summary">
        <Link href="/messages">
          <MessageCircle />
          <strong>{unreadMessages}</strong>
          <span>Unread messages</span>
        </Link>
        <Link href="/notifications">
          <Bell />
          <strong>{unreadNotifications}</strong>
          <span>New notifications</span>
        </Link>
        <Link href="/my/listings">
          <ShoppingBag />
          <strong>Manage</strong>
          <span>My listings</span>
        </Link>
        <Link href="/my/events">
          <CalendarDays />
          <strong>Manage</strong>
          <span>My events</span>
        </Link>
      </section>
      <section className="content-section">
        <div className="section-heading">
          <div>
            <span className="overline">RECENT LISTINGS</span>
            <h2>New around campus</h2>
          </div>
          <Link href="/marketplace">Browse marketplace</Link>
        </div>
        {listings.length ? (
          <div className="listing-grid">
            {listings.map((item) => (
              <ListingCard key={item.id} listing={item as never} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <ShoppingBag />
            <h2>No active listings yet</h2>
            <p>New campus listings will appear here.</p>
            <Link className="button button-primary" href="/sell">
              Create the first listing
            </Link>
          </div>
        )}
      </section>
      <div className="home-columns">
        <section className="dashboard-panel">
          <div className="section-heading">
            <div>
              <span className="overline">UPCOMING</span>
              <h2>Events</h2>
            </div>
            <Link href="/events">All events</Link>
          </div>
          {events.length ? (
            <div className="compact-list">
              {events.slice(0, 4).map((event) => (
                <Link href="/events" key={event.id}>
                  <CalendarDays />
                  <div>
                    <strong>{event.title}</strong>
                    <span>
                      {new Date(event.starts_at).toLocaleString()} ·{" "}
                      {event.location}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <CalendarDays />
              <p>No upcoming events.</p>
            </div>
          )}
        </section>
        <section className="dashboard-panel">
          <div className="section-heading">
            <div>
              <span className="overline">RECENT ACTIVITY</span>
              <h2>Notifications</h2>
            </div>
            <Link href="/notifications">View all</Link>
          </div>
          {notificationsResult.data?.length ? (
            <div className="compact-list">
              {notificationsResult.data.map((item) => (
                <Link href={item.href ?? "/notifications"} key={item.id}>
                  <Bell />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <Bell />
              <p>No recent activity.</p>
            </div>
          )}
        </section>
      </div>
      <section className="content-section">
        <div className="section-heading">
          <div>
            <span className="overline">SAVED ITEMS</span>
            <h2>Your favorites</h2>
          </div>
          <Heart />
        </div>
        {saved.data?.length ? (
          <div className="listing-grid">
            {saved.data.map((item) => (
              <ListingCard key={item.id} listing={item as never} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Heart />
            <h2>Nothing saved yet</h2>
            <p>Favorite marketplace items to keep them close.</p>
            <Link href="/marketplace">Explore listings</Link>
          </div>
        )}
      </section>
    </main>
  );
}
