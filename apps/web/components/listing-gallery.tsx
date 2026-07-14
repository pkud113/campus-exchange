"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";

type Media = { id: string; alt_text?: string | null };

export function ListingGallery({ media, title, category }: { media: Media[]; title: string; category: string }) {
  const [selected, setSelected] = useState(media[0]?.id ?? "");
  const active = media.find((item) => item.id === selected) ?? media[0];

  if (!active) {
    return (
      <div className="listing-gallery-empty sand">
        <div className={`product-shape shape-${category}`} aria-hidden="true"><i /><b /><em /></div>
        <span><ImageIcon /> No photo provided</span>
      </div>
    );
  }

  return (
    <div className="listing-gallery">
      <div className="listing-gallery-main">
        <img src={`/api/v1/media/${active.id}?variant=full`} alt={active.alt_text || title} />
      </div>
      {media.length > 1 && (
        <div className="listing-gallery-thumbnails" aria-label="Listing photos">
          {media.map((item, index) => (
            <button
              type="button"
              className={item.id === active.id ? "active" : ""}
              aria-label={`View photo ${index + 1}`}
              aria-pressed={item.id === active.id}
              onClick={() => setSelected(item.id)}
              key={item.id}
            >
              <img src={`/api/v1/media/${item.id}?variant=thumb`} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
