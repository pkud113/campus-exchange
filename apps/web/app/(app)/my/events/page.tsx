import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { OwnerContentActions } from "@/components/owner-content-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
export default async function MyEvents() {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/my/events");
  const { data } = await db
    .from("events")
    .select("id,title,description,location,starts_at,ends_at,cancelled_at")
    .eq("organizer_id", user.id)
    .is("deleted_at", null)
    .order("starts_at", { ascending: false });
  return (
    <main className="dashboard narrow">
      <PageHeader eyebrow="YOUR CONTENT" title="My events" description="Review, edit, and manage the events you organize." actions={<Link className="button button-primary" href="/events/new"><Plus /> Create event</Link>} />
      {data?.length ? (
        <div className="managed-list">
          {data.map((event) => (
            <article key={event.id}>
              <CalendarDays />
              <div>
                <h2>{event.title}</h2>
                <p>
                  {event.location} ·{" "}
                  {new Date(event.starts_at).toLocaleString()}
                </p>
              </div>
              <OwnerContentActions type="event" id={event.id} />
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <CalendarDays />
          <h2>No events yet</h2>
          <Link href="/events/new">Create your first event</Link>
        </div>
      )}
    </main>
  );
}
