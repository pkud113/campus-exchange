import { Search, Users } from "lucide-react";
import Link from "next/link";
import { MessageRequestComposer } from "@/components/message-request-composer";
import { PageHeader } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { FriendRequestButton } from "@/components/friend-request-button";
import { InstitutionFilter } from "@/components/institution-filter";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "People" };

export default async function People({ searchParams }: { searchParams: Promise<{ q?: string; institution?: string }> }) {
  const filters = await searchParams;
  const q = (filters.q ?? "").trim();
  const institution = filters.institution ?? "my";
  const db = await createSupabaseServerClient();
  const [{ data: { user } }, { data: people }] = await Promise.all([
    db.auth.getUser(),
    q.length >= 2
      ? db.rpc("search_member_directory_v2", { search_term: q, institution_filter: institution, after_profile: null, result_limit: 40 })
      : Promise.resolve({ data: [] }),
  ]);
  return (
    <main className="dashboard">
      <PageHeader eyebrow="CAMPUS NETWORK" title="Find verified members." description="Search active Campus Exchange members. Profiles remain private to verified members." />
      <form className="marketplace-search campus-filter" action="/people">
        <Search aria-hidden="true" />
        <input name="q" minLength={2} defaultValue={q} placeholder="Search a name, username, or campus" aria-label="Search members" required />
        <input type="hidden" name="institution" value={institution} />
        <button type="submit">Search</button>
      </form>
      <InstitutionFilter value={institution} />
      {q.length < 2 ? (
        <div className="empty-state"><Users /><h2>Search the member directory</h2><p>Enter at least two characters. Blocked and ineligible accounts are excluded.</p></div>
      ) : people?.length ? (
        <section className="people-grid" aria-label="Member search results">
          {people.map((person: any) => (
            <article className="person-card" key={person.id}>
              <UserAvatar name={person.display_name ?? person.handle} mediaId={person.avatar_media_id} size="large" />
              <div><Link href={`/u/${person.handle}`}><strong>{person.display_name ?? person.handle}</strong></Link><span>@{person.handle}</span><small>{person.campus_short_name ?? person.campus_name} · Joined {new Date(person.joined_month).toLocaleDateString(undefined,{month:"short",year:"numeric"})}</small>{person.mutual_friend_count > 0 && <span className="ui-badge">{person.mutual_friend_count} mutual {person.mutual_friend_count === 1 ? "friend" : "friends"}</span>}</div>
              <div className="person-actions"><FriendRequestButton profileId={person.id} initialStatus={person.relationship_status} requestedBy={person.relationship_requested_by} viewerId={user?.id ?? null}/>{person.relationship_status !== "self" && <MessageRequestComposer profileId={person.id} username={person.handle} campus={person.campus_name} label="Message" />}</div>
            </article>
          ))}
        </section>
      ) : (
        <div className="empty-state"><Search /><h2>No members found</h2><p>Try a different spelling or campus filter.</p></div>
      )}
    </main>
  );
}
