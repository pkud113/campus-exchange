import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EventForm } from "./event-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Create event" };
export default async function NewEvent({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const { organization } = await searchParams; let selected: { id: string; name: string } | null = null;
  if (organization) { const db = await createSupabaseServerClient(); const { data } = await db.from("organizations").select("id,name").eq("slug", organization).single(); selected = data ?? null; }
  return <main className="dashboard narrow"><Link className="back-link" href={organization ? `/organizations/${organization}` : "/events"}><ArrowLeft />{organization ? "Organization" : "Events"}</Link><div className="form-header"><span className="overline">NEW EVENT</span><h1>Put something on the calendar.</h1><p>Make it clear what students can expect and where to show up.</p></div><EventForm organization={selected} /></main>;
}
