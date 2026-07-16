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
  const [{ data: item }, { count: favoriteCount }, { data: safeMedia }] = await Promise.all([
    db
      .from("listings")
      .select(
        "id,title,description,category,condition,price_cents,currency,status,seller_id,visibility,exchange_methods,legacy_exchange_unspecified,campuses!inner(name,short_name,slug)",
      )
      .eq("id", id)
      .single(),
    db
      .from("favorites")
      .select("listing_id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("listing_id", id),
    db.rpc("safe_listing_media", { target_ids: [id] }),
  ]);
  if (!item) notFound();
  const { data: sellerRows } = await db.rpc("safe_profile_cards", { target_ids: [item.seller_id] });
  const seller = sellerRows?.[0];
  const media = (safeMedia ?? []).filter(
    (entry: { status: string }) => entry.status === "ready",
  );
  const sellerName = seller?.display_name ?? seller?.handle ?? "Verified student";
  const campus = Array.isArray(item.campuses) ? item.campuses[0] : item.campuses;
  const exchangeLabels: Record<string,string> = { campus_pickup:"Campus pickup", in_person_meetup:"In-person meetup", shipping:"Shipping", digital_delivery:"Digital delivery" };
  return (
    <main className="dashboard narrow">
      <Link className="back-link" href="/marketplace">
        <ArrowLeft /> Back to marketplace
      </Link>
      <div className="detail-layout listing-detail-layout">
        <ListingGallery media={media} title={item.title} category={item.category} />
        <section className="detail-copy">
          <span className="condition-pill">{item.condition.replaceAll("_", " ")}</span>
          <div className="content-badges"><span className="content-badge"><MapPin /> {campus?.name ?? "Campus"}</span>{item.visibility === "network" && <span className="content-badge">Campus network</span>}</div>
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
                <MapPin /> {campus?.name ?? "Campus member"}
              </small>
            </div>
          </Link>
          <ListingActions
            listingId={item.id}
            sellerId={item.seller_id}
            sellerUsername={seller?.handle ?? "member"}
            sellerCampus={campus?.name ?? "Campus Exchange"}
            isSeller={item.seller_id === user.id}
            initialFavorite={(favoriteCount ?? 0) > 0}
          />
          <div className="safe-inline"><MapPin /><p><strong>Exchange:</strong> {item.legacy_exchange_unspecified ? "Exchange details not specified." : (item.exchange_methods ?? []).map((method:string)=>exchangeLabels[method] ?? method).join(", ")}</p></div>
          <div className="safe-inline">
            <ShieldCheck />
            <p>Meet in a public campus location and inspect the item before paying.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
