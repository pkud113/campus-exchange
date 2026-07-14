"use client";

import { useEffect, useState } from "react";
import { FileImage, ImagePlus, X } from "lucide-react";
import { listingFileKey } from "@/lib/listing-upload-client";
import { normalizedImageType } from "@/lib/images";

export type ExistingListingPhoto = { id: string; altText: string };

function SelectedPhoto({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState("");
  const type = normalizedImageType(file.type, file.name);
  useEffect(() => {
    if (type === "image/heic" || type === "image/heif") return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, type]);
  return (
    <article className="photo-preview">
      {preview ? <img src={preview} alt="" /> : <FileImage aria-hidden="true" />}
      <div>
        <strong>{file.name}</strong>
        <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
      </div>
      <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>
        <X />
      </button>
    </article>
  );
}

export function ListingPhotoPicker({
  files,
  onChange,
  existing = [],
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  existing?: ExistingListingPhoto[];
  disabled?: boolean;
}) {
  const remaining = Math.max(0, 6 - existing.length - files.length);
  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const unique = new Map(files.map((file) => [listingFileKey(file), file]));
    for (const file of Array.from(incoming)) {
      if (unique.size >= 6 - existing.length) break;
      unique.set(listingFileKey(file), file);
    }
    onChange([...unique.values()]);
  }
  return (
    <section>
      <h2>Photos</h2>
      {existing.length > 0 && (
        <div className="photo-preview-grid" aria-label="Existing listing photos">
          {existing.map((photo) => (
            <article className="photo-preview existing" key={photo.id}>
              <img
                src={`/api/v1/media/${photo.id}?variant=thumb`}
                alt={photo.altText}
              />
              <div>
                <strong>Current photo</strong>
              </div>
            </article>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="photo-preview-grid" aria-label="Selected listing photos">
          {files.map((file) => (
            <SelectedPhoto
              key={listingFileKey(file)}
              file={file}
              onRemove={() =>
                onChange(files.filter((item) => listingFileKey(item) !== listingFileKey(file)))
              }
            />
          ))}
        </div>
      )}
      <label className={`photo-drop ${remaining === 0 ? "disabled" : ""}`}>
        <ImagePlus />
        <strong>{remaining > 0 ? `Add up to ${remaining} photo${remaining === 1 ? "" : "s"}` : "Six-photo limit reached"}</strong>
        <span>JPEG, PNG, WebP, HEIC, or HEIF · 20 MB each</span>
        <input
          type="file"
          accept="image/webp,image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
          multiple
          disabled={disabled || remaining === 0}
          aria-label="Listing photos"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
    </section>
  );
}
