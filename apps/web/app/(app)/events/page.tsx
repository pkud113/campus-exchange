import { CalendarDays, Globe2, MapPin, Plus, Users } from "lucide-react";
import Link from "next/link";
import { loadEvents } from "@/lib/loaders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RsvpButton } from "./rsvp-button";
import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { MessageRequestComposer } from "@/components/message-request-composer";
export const metadata = { title: "Campus events" };
export default async function Events({ searchParams }: { searchParams: Promise<{ event?: string; campus?: string }> }) {
  const { event: targetEventId, campus = "my" } = await searchParams;
  const events = await loadEvents({ campus });
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/events");
  const [{ data: rsvps }, { data: campuses }] = await Promise.all([events.length
    ? await db
        .from("event_rsvps")
        .select("event_id")
        .eq("profile_id", user.id)
        .in(
          "event_id",
          events.map((event) => event.id),
        )
    : { data: [] }, db.from("campuses").select("name,short_name,slug").eq("status","enabled").order("name")]);
  const attending = new Set((rsvps ?? []).map((item) => item.event_id));
  return (
    <main className="dashboard">
      <PageHeader
        eyebrow="CAMPUS CALENDAR"
        title="Find your next thing."
        description="Discover campus events and events intentionally shared across the campus network."
        actions={<Link className="button button-primary" href="/events/new"><Plus /> Create event</Link>}
      />
      <form className="campus-filter" action="/events"><label>Campus<select name="campus" defaultValue={campus}><option value="my">My campus</option><option value="all">All campuses</option>{(campuses??[]).map((item:any)=><option value={item.slug} key={item.slug}>{item.short_name??item.name}</option>)}</select></label><button className="button button-ghost button-small">Apply</button></form>
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
                <div className="content-badges"><span className="content-badge"><MapPin /> {(Array.isArray(event.campuses)?event.campuses[0]:event.campuses)?.short_name}</span>{event.visibility==="network"&&<span className="content-badge"><Globe2/>Campus network</span>}</div>
                <p>{event.description}</p>
                <div className="event-meta">
                  <span>
                    <MapPin />
                    {event.location}
                  </span>
                  <span>
                    <Users />
                    {event.attendee_count ?? 0} going
                  </span>
                </div>
              </div>
              <div className="event-actions"><RsvpButton eventId={event.id} initialAttending={attending.has(event.id)} />
                {event.organizer_id!==user.id && event.organizer && <MessageRequestComposer profileId={event.organizer_id} username={(event.organizer as any).handle} campus={(event.organizer as any).campus_name} context={{type:"event",id:event.id}} label="Message organizer" />}
              </div>
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
