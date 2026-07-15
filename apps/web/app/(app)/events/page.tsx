import { CalendarDays, MapPin, Plus, Users } from "lucide-react";
import Link from "next/link";
import { loadEvents } from "@/lib/loaders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RsvpButton } from "./rsvp-button";
import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
export const metadata = { title: "Campus events" };
export default async function Events({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event: targetEventId } = await searchParams;
  const events = await loadEvents();
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/events");
  const { data: rsvps } = events.length
    ? await db
        .from("event_rsvps")
        .select("event_id")
        .eq("profile_id", user.id)
        .in(
          "event_id",
          events.map((event) => event.id),
        )
    : { data: [] };
  const attending = new Set((rsvps ?? []).map((item) => item.event_id));
  return (
    <main className="dashboard">
      <PageHeader
        eyebrow="CAMPUS CALENDAR"
        title="Find your next thing."
        description="Real events created by verified members of your campus."
        actions={<Link className="button button-primary" href="/events/new"><Plus /> Create event</Link>}
      />
      {targetEventId && !events.some((event) => event.id === targetEventId) && <p className="discussion-notice" role="status">That event is no longer available. Here are the current campus events.</p>}
      {events.length ? (
        <div className="event-grid">
          {events.map((event, index) => (
            <article
              id={`event-${event.id}`}
              className={`event-card accent-${["coral", "violet", "green"][index % 3]}${event.id === targetEventId ? " notification-target" : ""}`}
              key={event.id}
            >
              <div className="event-date">
                <span>
                  {new Date(event.starts_at)
                    .toLocaleString("en-US", { month: "short" })
                    .toUpperCase()}
                </span>
                <strong>{new Date(event.starts_at).getDate()}</strong>
              </div>
              <div className="event-body">
                <span>
                  {new Date(event.starts_at).toLocaleString("en-US", {
                    weekday: "long",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <h2>{event.title}</h2>
                <p>{event.description}</p>
                <div className="event-meta">
                  <span>
                    <MapPin />
                    {event.location}
                  </span>
                  <span>
                    <Users />
                    {event.event_rsvps?.[0]?.count ?? 0} going
                  </span>
                </div>
              </div>
              <RsvpButton
                eventId={event.id}
                initialAttending={attending.has(event.id)}
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <CalendarDays />
          <h2>No upcoming events</h2>
          <p>Create the first event for your campus.</p>
          <Link className="button button-primary" href="/events/new">
            Create event
          </Link>
        </div>
      )}
    </main>
  );
}
