import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventEditForm } from "./event-edit-form";
export default async function EditEvent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${id}/edit`)}`);
  const { data } = await db
    .from("events")
    .select(
      "id,organizer_id,title,description,location,starts_at,ends_at,capacity,visibility,deleted_at",
    )
    .eq("id", id)
    .single();
  if (!data || data.organizer_id !== user.id || data.deleted_at) notFound();
  return (
    <main className="dashboard narrow">
      <div className="page-title">
        <span className="overline">MY EVENTS</span>
        <h1>Edit event</h1>
      </div>
      <EventEditForm event={data} />
    </main>
  );
}
