"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { ListingPhotoPicker } from "@/components/listing-photo-picker";
import {
  formatUploadFailures,
  uploadListingFiles,
  validateListingFiles,
} from "@/lib/listing-upload-client";

export function ListingForm() {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
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
    setProgress("Saving a private draft…");
    const response = await fetch("/api/v1/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description: form.get("description"),
        category: form.get("category"),
        condition: form.get("condition"),
        visibility: form.get("visibility"),
        exchangeMethods: form.getAll("exchangeMethods"),
        priceCents: Math.round(Number(form.get("price")) * 100),
        currency: "USD",
        idempotencyKey: idempotencyKey.current,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error?.message ?? "Could not save this listing.");
      setBusy(false);
      setProgress("");
      return;
    }

    const failures = await uploadListingFiles({
      listingId: body.data.id,
      title,
      files,
      uploadedKeys: uploadedKeys.current,
      onProgress: setProgress,
    });
    if (failures.length) {
      setError(
        `The listing is still a private draft because ${failures.length} image${failures.length === 1 ? "" : "s"} failed. Retry to finish publishing. ${formatUploadFailures(failures)}`,
      );
      setProgress("");
      setBusy(false);
      return;
    }

    setProgress("Publishing listing…");
    const publish = await fetch(`/api/v1/listings/${body.data.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "active",
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (!publish.ok) {
      const detail = await publish.json().catch(() => null);
      setError(
        detail?.error?.message ??
          "Images uploaded, but the listing could not be published. Retry to finish.",
      );
      setProgress("");
      setBusy(false);
      return;
    }
    router.push(`/listings/${body.data.id}`);
    router.refresh();
  }

  return (
    <form className="listing-form" onSubmit={submit}>
      <ListingPhotoPicker files={files} onChange={setFiles} disabled={busy} />
      <section>
        <h2>Details</h2>
        <label>
          Title
          <input
            name="title"
            minLength={3}
            maxLength={100}
            placeholder="What are you selling?"
            required
          />
        </label>
        <div className="form-row">
          <label>
            Category
            <select name="category" defaultValue="" required>
              <option value="" disabled>
                Choose one
              </option>
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
            <select name="condition" defaultValue="good">
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
            minLength={10}
            maxLength={5000}
            rows={6}
            placeholder="Share dimensions, included parts, wear, and pickup details…"
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
              placeholder="0.00"
              required
            />
          </div>
        </label>
        <fieldset className="choice-fieldset">
          <legend>Who can see this listing?</legend>
          <label><input type="radio" name="visibility" value="campus_only" defaultChecked /> My campus only</label>
          <label><input type="radio" name="visibility" value="network" /> All Campus Exchange campuses</label>
        </fieldset>
        <fieldset className="choice-fieldset">
          <legend>Exchange or delivery</legend>
          <label><input type="checkbox" name="exchangeMethods" value="campus_pickup" defaultChecked /> Campus pickup</label>
          <label><input type="checkbox" name="exchangeMethods" value="in_person_meetup" /> In-person meetup</label>
          <label><input type="checkbox" name="exchangeMethods" value="shipping" /> Shipping</label>
          <label><input type="checkbox" name="exchangeMethods" value="digital_delivery" /> Digital delivery</label>
        </fieldset>
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
      <div className="form-actions">
        <Link className="button button-ghost" href="/marketplace">
          Cancel
        </Link>
        <button className="button button-primary" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle className="spin" /> Working…
            </>
          ) : (
            "Publish listing"
          )}
        </button>
      </div>
    </form>
  );
}
