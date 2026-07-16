import { Check, ChevronRight, Plus, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { ListingCard, type ListingCardItem } from "@/components/listing-card";
import { PageHeader, SectionHeader } from "@/components/ui";
import { loadMarketplacePage } from "@/lib/loaders";
import { buildMarketplaceHref, type MarketplaceFilters } from "@/lib/marketplace-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Marketplace" };

const categories = [
  ["", "All listings"],
  ["books", "Books"],
  ["electronics", "Electronics"],
  ["furniture", "Furniture"],
  ["clothing", "Clothing"],
  ["housing", "Housing"],
  ["transport", "Transport"],
  ["other", "Other"],
] as const;

export default async function Marketplace({ searchParams }: { searchParams: Promise<MarketplaceFilters> }) {
  const filters = await searchParams;
  const { listings, nextCursor } = await loadMarketplacePage(filters);
  const db = await createSupabaseServerClient();
  const [{ data: favorites }, { data: campuses }] = await Promise.all([
    listings.length ? db.from("favorites").select("listing_id").in("listing_id", listings.map((item) => item.id)) : Promise.resolve({ data: [] }),
    db.from("campuses").select("name,short_name,slug").eq("status", "enabled").order("name"),
  ]);
  const favoriteIds = new Set((favorites ?? []).map((item) => item.listing_id));
  const filtered = Boolean(filters.q || filters.category || (filters.sort && filters.sort !== "newest") || (filters.campus && filters.campus !== "my"));

  return (
    <main className="dashboard marketplace-page">
      <PageHeader
        eyebrow="CAMPUS MARKETPLACE"
        title="Find what you need."
        description="Browse campus listings or intentionally network-visible listings from other enabled campuses."
        actions={<Link className="button button-primary" href="/sell"><Plus /> Create listing</Link>}
      />

      <form className="marketplace-search" action="/marketplace">
        <Search aria-hidden="true" />
        <input name="q" defaultValue={filters.q} aria-label="Search marketplace" placeholder="Search desks, textbooks, bikes…" />
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.campus && <input type="hidden" name="campus" value={filters.campus} />}
        <button type="submit">Search</button>
      </form>

      <div className="marketplace-mobile-controls" aria-label="Marketplace categories">
        {categories.map(([value, label]) => (
          <Link
            className={(filters.category ?? "") === value ? "active" : ""}
            href={buildMarketplaceHref(filters, { category: value || null, cursor: null })}
            key={value || "all"}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="marketplace-layout">
        <aside className="marketplace-filters">
          <header><SlidersHorizontal /><div><span className="overline">BROWSE</span><h2>Marketplace</h2></div></header>
          <nav aria-label="Listing categories">
            {categories.map(([value, label]) => {
              const active = (filters.category ?? "") === value;
              return (
                <Link
                  className={active ? "active" : ""}
                  href={buildMarketplaceHref(filters, { category: value || null, cursor: null })}
                  aria-current={active ? "page" : undefined}
                  key={value || "all"}
                >
                  <span>{label}</span>{active && <Check />}
                </Link>
              );
            })}
          </nav>
          <form action="/marketplace" className="marketplace-sort">
            {filters.q && <input type="hidden" name="q" value={filters.q} />}
            {filters.category && <input type="hidden" name="category" value={filters.category} />}
            <label>Campus
              <select name="campus" defaultValue={filters.campus ?? "my"}>
                <option value="my">My campus</option>
                <option value="all">All campuses</option>
                {(campuses ?? []).map((campus: any) => <option key={campus.slug} value={campus.slug}>{campus.short_name ?? campus.name}</option>)}
              </select>
            </label>
            <label>Sort listings
              <select name="sort" defaultValue={filters.sort ?? "newest"}>
                <option value="newest">Newest first</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
            <button className="button button-ghost button-small" type="submit">Apply sorting</button>
          </form>
          <div className="marketplace-safety"><ShieldCheck /><strong>Trade safely</strong><p>Meet in a busy campus location and inspect every item before paying.</p><Link href="/safety">Read safety tips <ChevronRight /></Link></div>
        </aside>

        <section className="marketplace-results">
          <SectionHeader
            eyebrow={filtered ? "SEARCH RESULTS" : "JUST LISTED"}
            title={filtered ? `${listings.length}${nextCursor ? "+" : ""} matches` : "Fresh around campus"}
            description={filtered ? "Results honor each listing’s campus or network visibility." : "New campus listings appear here as students post them."}
            action={filtered ? <Link href="/marketplace">Clear filters</Link> : undefined}
          />
          {listings.length ? (
            <>
              <div className="listing-grid marketplace-grid">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing as ListingCardItem} initialFavorite={favoriteIds.has(listing.id)} />
                ))}
              </div>
              {nextCursor && (
                <div className="pagination-actions">
                  <Link className="button button-ghost" href={buildMarketplaceHref(filters, { cursor: nextCursor })}>Load more listings</Link>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state"><Search /><h2>No listings found</h2><p>Try another search or create the first matching listing.</p><Link className="button button-primary" href="/sell">Create listing</Link></div>
          )}
        </section>
      </div>
    </main>
  );
}
