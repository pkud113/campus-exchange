import Link from "next/link";
import { ArrowLeft, MapPin, ShieldCheck } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { ListingGallery } from "@/components/listing-gallery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { ListingActions } from "./listing-actions";

type Props = { params: Promise<{ id: string }> };

export default async function ListingDetail({ params }: Props) {
  const { id } = await params;
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/listings/${id}`)}`);
  const [{ data: item }, { count: favoriteCount }] = await Promise.all([
    db
      .from("listings")
      .select(
        "id,title,description,category,condition,price_cents,currency,status,seller_id,profiles!listings_seller_id_fkey(handle,display_name,avatar_media_id),media_uploads(id,alt_text,status)",
      )
      .eq("id", id)
      .single(),
    db
      .from("favorites")
      .select("listing_id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("listing_id", id),
  ]);
  if (!item) notFound();
  const seller = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
  const media = (item.media_uploads ?? []).filter(
    (entry: { status: string }) => entry.status === "ready",
  );
  const sellerName = seller?.display_name ?? seller?.handle ?? "Verified student";
  return (
    <main className="dashboard narrow">
      <Link className="back-link" href="/marketplace">
        <ArrowLeft /> Back to marketplace
      </Link>
      <div className="detail-layout listing-detail-layout">
        <ListingGallery media={media} title={item.title} category={item.category} />
        <section className="detail-copy">
          <span className="condition-pill">{item.condition.replaceAll("_", " ")}</span>
          <h1>{item.title}</h1>
          <strong className="detail-price">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: item.currency,
              maximumFractionDigits: 0,
            }).format(item.price_cents / 100)}
          </strong>
          <p>{item.description}</p>
          <Link className="seller-card" href={`/u/${seller?.handle ?? "member"}`}>
            <UserAvatar name={sellerName} mediaId={seller?.avatar_media_id} size="large" />
            <div>
              <strong>{sellerName}</strong>
              <span>
                <ShieldCheck /> Verified student
              </span>
              <small>
                <MapPin /> Michigan State University
              </small>
            </div>
          </Link>
          <ListingActions
            listingId={item.id}
            isSeller={item.seller_id === user.id}
            initialFavorite={(favoriteCount ?? 0) > 0}
          />
          <div className="safe-inline">
            <ShieldCheck />
            <p>Meet in a public campus location and inspect the item before paying.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
