"use client";

import { Heart, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { UserAvatar } from "./user-avatar";

type Seller = {
  display_name?: string | null;
  handle?: string | null;
  avatar_media_id?: string | null;
  campus_name?: string | null;
  campus_short_name?: string | null;
};

export type ListingCardItem = {
  id: string;
  title: string;
  category: string;
  condition: string;
  price_cents: number;
  currency: string;
  created_at?: string;
  visibility?: "campus_only" | "network";
  exchange_methods?: string[] | null;
  legacy_exchange_unspecified?: boolean;
  campuses?: { name?: string; short_name?: string } | Array<{ name?: string; short_name?: string }> | null;
  profiles?: Seller | Seller[] | null;
  tone?: string;
  media_uploads?: Array<{ id: string; alt_text?: string; status?: string }>;
};

function sellerFrom(value: ListingCardItem["profiles"]): Seller {
  const seller = Array.isArray(value) ? value[0] : value;
  return seller ?? {};
}

function displayPrice(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

export function ListingCard({
  listing,
  initialFavorite = false,
}: {
  listing: ListingCardItem;
  initialFavorite?: boolean;
}) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);
  const media = listing.media_uploads?.find((item) => item.status === "ready");
  const seller = sellerFrom(listing.profiles);
  const sellerName = seller.display_name ?? seller.handle ?? "Verified student";
  const listingCampus = Array.isArray(listing.campuses) ? listing.campuses[0] : listing.campuses;
  const campusName = seller.campus_short_name ?? listingCampus?.short_name ?? seller.campus_name ?? listingCampus?.name ?? "Campus";

  async function toggle() {
    if (busy) return;
    const next = !favorite;
    setBusy(true);
    setFavorite(next);
    const init: RequestInit = { method: next ? "POST" : "DELETE" };
    if (next) {
      init.headers = { "content-type": "application/json" };
      init.body = "{}";
    }
    const response = await fetch(`/api/v1/listings/${listing.id}/favorite`, init).catch(() => null);
    if (!response?.ok) setFavorite(!next);
    setBusy(false);
  }

  return (
    <article className="listing-card">
      <Link className="listing-card-link" href={`/listings/${listing.id}`}>
        <div className={`listing-visual ${listing.tone ?? "sand"}`}>
          {media ? (
            <img src={`/api/v1/media/${media.id}?variant=card`} alt={media.alt_text ?? listing.title} />
          ) : (
            <div className={`product-shape shape-${listing.category}`} aria-hidden="true">
              <i /><b /><em />
            </div>
          )}
          <span className="condition-pill">{listing.condition.replaceAll("_", " ")}</span>
        </div>
        <div className="listing-details">
          <strong className="listing-price">{displayPrice(listing.price_cents, listing.currency)}</strong>
          <h3>{listing.title}</h3>
          <div className="content-badges"><span className="content-badge"><MapPin /> {campusName}</span>{listing.visibility === "network" && <span className="content-badge">Campus network</span>}</div>
          <div className="listing-seller">
            <UserAvatar name={sellerName} mediaId={seller.avatar_media_id ?? null} size="small" />
            <span>
              <strong>{sellerName}</strong>
              <small>{listing.legacy_exchange_unspecified ? "Exchange details not specified" : "Exchange methods listed"}</small>
            </span>
          </div>
        </div>
      </Link>
      <button
        type="button"
        className={favorite ? "favorite active" : "favorite"}
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={favorite}
        disabled={busy}
        onClick={toggle}
      >
        <Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
