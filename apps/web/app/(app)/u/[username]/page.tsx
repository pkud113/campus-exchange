import Link from "next/link";
import { CalendarDays, MessageCircle, ShoppingBag } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ListingCard } from "@/components/listing-card";
import { UserAvatar } from "@/components/user-avatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BlockButton } from "./block-button";

export default async function PublicProfile({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/u/${username}`)}`);
  const { data: profile } = await db
    .from("profiles")
    .select(
      "id,handle,display_name,bio,avatar_media_id,banner_media_id,created_at,campuses(name)",
    )
    .eq("handle", username.toLowerCase())
    .eq("status", "active")
    .single();
  if (!profile) notFound();
  const [
    { data: listings },
    { data: events },
    { count: blockCount },
    { data: favorites },
  ] = await Promise.all([
    db
      .from("listings")
      .select(
        "id,title,category,condition,price_cents,currency,profiles!listings_seller_id_fkey(handle,display_name),media_uploads(id,alt_text,status)",
      )
      .eq("seller_id", profile.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("events")
      .select("id,title,location,starts_at")
      .eq("organizer_id", profile.id)
      .is("deleted_at", null)
      .is("cancelled_at", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(8),
    db
      .from("blocks")
      .select("blocked_id", { count: "exact", head: true })
      .eq("blocker_id", user.id)
      .eq("blocked_id", profile.id),
    db.from("favorites").select("listing_id"),
  ]);
  const campus = Array.isArray(profile.campuses)
    ? profile.campuses[0]
    : profile.campuses;
  const favoriteIds = new Set((favorites ?? []).map((item) => item.listing_id));
  const own = profile.id === user.id;
  const displayName = profile.display_name ?? profile.handle;
  return (
    <main className="dashboard narrow">
      <section className="public-profile">
        <div className="public-profile-banner">
          {profile.banner_media_id && (
            <img src={`/api/v1/media/${profile.banner_media_id}?variant=full`} alt="" />
          )}
        </div>
        <div className="public-profile-heading">
          <UserAvatar
            name={displayName}
            mediaId={profile.avatar_media_id}
            size="profile"
          />
          <div>
            <h1>{displayName}</h1>
            <p>
              @{profile.handle} · {campus && "name" in campus ? String(campus.name) : "Campus member"}
            </p>
            <small>
              Joined {new Date(profile.created_at).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </small>
          </div>
          {!own && (
            <div className="profile-actions">
              <Link
                className="button button-primary"
                href={`/messages?new=${encodeURIComponent(String(profile.handle))}`}
              >
                <MessageCircle /> Request conversation
              </Link>
              <BlockButton profileId={profile.id} initialBlocked={(blockCount ?? 0) > 0} />
            </div>
          )}
          {own && (
            <Link className="button button-ghost" href="/settings">
              Edit profile
            </Link>
          )}
        </div>
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      </section>
      <section className="content-section">
        <div className="section-heading">
          <div>
            <span className="overline">LISTINGS</span>
            <h2>{displayName} is selling</h2>
          </div>
          <ShoppingBag />
        </div>
        {listings?.length ? (
          <div className="listing-grid">
            {listings.map((item) => (
              <ListingCard
                key={item.id}
                listing={item as never}
                initialFavorite={favoriteIds.has(item.id)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <ShoppingBag /> <p>No active listings.</p>
          </div>
        )}
      </section>
      <section className="content-section">
        <div className="section-heading">
          <div>
            <span className="overline">EVENTS</span>
            <h2>Upcoming events</h2>
          </div>
          <CalendarDays />
        </div>
        {events?.length ? (
          <div className="compact-list">
            {events.map((event) => (
              <Link href="/events" key={event.id}>
                <CalendarDays />
                <div>
                  <strong>{event.title}</strong>
                  <span>
                    {new Date(event.starts_at).toLocaleString()} · {event.location}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <CalendarDays /> <p>No upcoming events.</p>
          </div>
        )}
      </section>
    </main>
  );
}
