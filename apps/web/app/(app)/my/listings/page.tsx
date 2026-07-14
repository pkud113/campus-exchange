import Link from "next/link";
import { Plus, ShoppingBag } from "lucide-react";
import { ListingCard, type ListingCardItem } from "@/components/listing-card";
import { PageHeader } from "@/components/ui";
import { OwnerContentActions } from "@/components/owner-content-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export default async function MyListings() {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/my/listings");
  const { data } = await db
    .from("listings")
    .select(
      "id,title,category,condition,price_cents,currency,status,created_at,profiles!listings_seller_id_fkey(handle,display_name,avatar_media_id),media_uploads(id,alt_text,status)",
    )
    .eq("seller_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (
    <main className="dashboard">
      <PageHeader eyebrow="YOUR CONTENT" title="My listings" description="Manage the items you have shared with your campus." actions={<Link className="button button-primary" href="/sell"><Plus /> Create listing</Link>} />
      {data?.length ? (
        <div className="managed-grid">
          {data.map((item) => (
            <div key={item.id}>
              <ListingCard listing={item as ListingCardItem} />
              <OwnerContentActions type="listing" id={item.id} />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ShoppingBag />
          <h2>No listings yet</h2>
          <Link href="/sell">Create your first listing</Link>
        </div>
      )}
    </main>
  );
}
