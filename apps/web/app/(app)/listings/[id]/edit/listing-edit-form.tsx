"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import {
  ListingPhotoPicker,
  type ExistingListingPhoto,
} from "@/components/listing-photo-picker";
import {
  formatUploadFailures,
  uploadListingFiles,
  validateListingFiles,
} from "@/lib/listing-upload-client";

type Listing = {
  id: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  price_cents: number;
  currency: string;
};

export function ListingEditForm({
  listing,
  existingPhotos,
}: {
  listing: Listing;
  existingPhotos: ExistingListingPhoto[];
}) {
  const router = useRouter();
  const uploadedKeys = useRef(new Set<string>());
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const validationError = validateListingFiles(files);
    if (validationError) {
      setError(validationError);
      setBusy(false);
      return;
    }
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "");
    setProgress("Saving listing details…");
    const response = await fetch(`/api/v1/listings/${listing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description: form.get("description"),
        category: form.get("category"),
        condition: form.get("condition"),
        priceCents: Math.round(Number(form.get("price")) * 100),
        currency: "USD",
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error?.message ?? "Unable to update listing.");
      setProgress("");
      setBusy(false);
      return;
    }

    const failures = await uploadListingFiles({
      listingId: listing.id,
      title,
      files,
      uploadedKeys: uploadedKeys.current,
      onProgress: setProgress,
    });
    if (failures.length) {
      setError(
        `The listing details were saved, but ${failures.length} image${failures.length === 1 ? "" : "s"} failed. ${formatUploadFailures(failures)}`,
      );
      setProgress("");
      setBusy(false);
      return;
    }
    router.push(`/listings/${listing.id}`);
    router.refresh();
  }

  return (
    <form className="listing-form" onSubmit={submit}>
      <ListingPhotoPicker
        files={files}
        onChange={setFiles}
        existing={existingPhotos}
        disabled={busy}
      />
      <section>
        <h2>Listing details</h2>
        <label>
          Title
          <input
            name="title"
            defaultValue={listing.title}
            minLength={3}
            maxLength={100}
            required
          />
        </label>
        <div className="form-row">
          <label>
            Category
            <select name="category" defaultValue={listing.category} required>
              <option value="books">Books</option>
              <option value="electronics">Electronics</option>
              <option value="furniture">Furniture</option>
              <option value="clothing">Clothing</option>
              <option value="housing">Housing</option>
              <option value="transport">Transport</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Condition
            <select name="condition" defaultValue={listing.condition}>
              <option value="new">New</option>
              <option value="like_new">Like new</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Well used</option>
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={listing.description}
            minLength={10}
            maxLength={5000}
            rows={6}
            required
          />
        </label>
        <label>
          Price
          <div className="price-input">
            <span>$</span>
            <input
              name="price"
              type="number"
              min="0"
              max="100000"
              step="0.01"
              defaultValue={(listing.price_cents / 100).toFixed(2)}
              required
            />
          </div>
        </label>
      </section>
      {progress && (
        <p className="form-notice" role="status">
          {progress}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" disabled={busy}>
        {busy ? (
          <>
            <LoaderCircle className="spin" /> Saving…
          </>
        ) : (
          "Save changes"
        )}
      </button>
    </form>
  );
}
