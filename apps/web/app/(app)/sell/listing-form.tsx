"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImagePlus, LoaderCircle } from "lucide-react";

const acceptedTypes = new Set(["image/webp", "image/png", "image/jpeg"]);

export function ListingForm() {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
  const uploadedFiles = useRef(new Set<string>());
  const preparedUploads = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  async function uploadWithRetry(url: string, file: File) {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(url, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      }).catch(() => null);
      if (response?.ok || !response || response.status < 500) break;
    }
    return response;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const files = form
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0)
      .slice(0, 6);
    const invalid = files.find(
      (file) => !acceptedTypes.has(file.type) || file.size > 8 * 1024 * 1024,
    );
    if (invalid) {
      setError(
        `${invalid.name} must be a WebP, PNG, or JPEG image no larger than 8 MB.`,
      );
      setBusy(false);
      return;
    }
    setProgress("Saving a private draft…");
    const response = await fetch("/api/v1/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        category: form.get("category"),
        condition: form.get("condition"),
        priceCents: Math.round(Number(form.get("price")) * 100),
        currency: "USD",
        idempotencyKey: idempotencyKey.current,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Could not save this listing.");
      setBusy(false);
      setProgress("");
      return;
    }
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      if (uploadedFiles.current.has(fileKey)) continue;
      setProgress(`Uploading image ${index + 1} of ${files.length}…`);
      let uploadUrl = preparedUploads.current.get(fileKey);
      if (!uploadUrl) {
        const grant = await fetch("/api/v1/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            listingId: body.data.id,
            purpose: "listing",
            contentType: file.type,
            byteSize: file.size,
            altText: String(form.get("title")),
          }),
        });
        if (!grant.ok) {
          const detail = await grant.json().catch(() => null);
          failures.push(
            `${file.name}: ${detail?.error?.message ?? "upload could not be prepared"}`,
          );
          continue;
        }
        const upload = await grant.json();
        uploadUrl = upload?.data?.uploadUrl;
        if (typeof uploadUrl !== "string") {
          failures.push(`${file.name}: upload response was invalid`);
          continue;
        }
        preparedUploads.current.set(fileKey, uploadUrl);
      }
      if (!uploadUrl) continue;
      const put = await uploadWithRetry(uploadUrl, file);
      if (!put?.ok) {
        const detail = put ? await put.json().catch(() => null) : null;
        if (put?.status === 403) preparedUploads.current.delete(fileKey);
        failures.push(
          `${file.name}: ${detail?.error?.message ?? "upload failed"}`,
        );
      } else {
        uploadedFiles.current.add(fileKey);
        preparedUploads.current.delete(fileKey);
      }
    }
    if (failures.length) {
      setError(
        `The listing is still a private draft because ${failures.length} image${failures.length === 1 ? "" : "s"} failed. Retry to finish publishing. ${failures.join(" ")}`,
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
      <section>
        <h2>Photos</h2>
        <label className="photo-drop">
          <ImagePlus />
          <strong>Add up to 6 photos</strong>
          <span>WebP, PNG, or JPEG · 8 MB each</span>
          <input
            name="photos"
            type="file"
            accept="image/webp,image/png,image/jpeg"
            multiple
            aria-label="Listing photos"
          />
        </label>
      </section>
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
            <select name="category" defaultValue="">
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
