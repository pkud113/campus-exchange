"use client";

import { ImagePlus, LoaderCircle, Send, Trash2, X } from "lucide-react";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, Select, TextArea } from "../ui";
import { maxImageBytes, normalizedImageType } from "../../lib/images";
import type { SocialPostView } from "../../lib/social";

type SelectedImage = { key: string; file: File; preview: string; alt: string; decorative: boolean; id?: string; error?: string | undefined };

export function SocialPostComposer({ initialPost, networkEnabled = true, autoFocus = false, onSaved, onCancel }: {
  initialPost?: SocialPostView;
  networkEnabled?: boolean;
  autoFocus?: boolean;
  onSaved: (post?: SocialPostView) => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initialPost?.body ?? "");
  const [visibility, setVisibility] = useState(initialPost?.visibility ?? "campus_only");
  const [existingMedia, setExistingMedia] = useState(initialPost?.media ?? []);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const remaining = 10000 - body.length;
  const mediaCount = existingMedia.length + images.length;
  const editing = Boolean(initialPost);
  const canSubmit = body.trim().length > 0 && mediaCount <= 4 && !busy;
  const mediaAccept = "image/webp,image/png,image/jpeg,image/heic,image/heif,.heic,.heif";

  const imageErrors = useMemo(() => images.filter((image) => image.error), [images]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const available = Math.max(0, 4 - mediaCount);
    const next = Array.from(files).slice(0, available).map((file) => {
      const contentType = normalizedImageType(file.type, file.name);
      const error = !contentType || file.size <= 0 || file.size > maxImageBytes ? "Use JPEG, PNG, WebP, HEIC, or HEIF up to 20 MB." : undefined;
      return { key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), alt: "", decorative: false, error };
    });
    setImages((value) => [...value, ...next]);
  }

  function removeImage(key: string) {
    setImages((value) => { const selected = value.find((image) => image.key === key); if (selected) URL.revokeObjectURL(selected.preview); return value.filter((image) => image.key !== key); });
  }

  async function uploadImage(image: SelectedImage) {
    const contentType = normalizedImageType(image.file.type, image.file.name);
    if (!contentType) throw new Error("Unsupported image type.");
    const grant = await fetch("/api/v1/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purpose: "social_post", contentType, byteSize: image.file.size, altText: image.decorative ? "" : image.alt.trim() }) });
    const grantBody = await grant.json();
    if (!grant.ok) throw new Error(grantBody.error?.message ?? "Unable to prepare an image upload.");
    const upload = await fetch(grantBody.data.uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: image.file });
    const uploadBody = await upload.json();
    if (!upload.ok) throw new Error(uploadBody.error?.message ?? "Unable to upload an image.");
    return uploadBody.data.id as string;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setNotice("");
    const invalidAlt = images.find((image) => !image.decorative && image.alt.trim().length < 2);
    if (invalidAlt) { setNotice("Describe each image or mark it decorative before publishing."); return; }
    if (!canSubmit || imageErrors.length) return;
    setBusy(true); setNotice(editing ? "Saving changes…" : "Uploading and publishing…");
    try {
      const uploadedIds = await Promise.all(images.map(uploadImage));
      const mediaIds = [...existingMedia.map((media) => media.id), ...uploadedIds];
      const response = await fetch(editing ? `/api/v1/social/posts/${initialPost!.id}` : "/api/v1/social/posts", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing
          ? { body: body.trim(), mediaIds, visibility }
          : { body: body.trim(), mediaIds, visibility, organizationId: null, idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to save this post.");
      setNotice(editing ? "Post updated." : "Post published.");
      if (!editing) { setBody(""); setExistingMedia([]); images.forEach((image) => URL.revokeObjectURL(image.preview)); setImages([]); }
      onSaved(result.data?.id ? result.data : undefined);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save this post.");
    } finally { setBusy(false); }
  }

  return <form className="social-composer-form" data-interactive={interactive} onSubmit={submit}>
    <div className="social-composer-heading"><div><span className="overline">{editing ? "EDIT POST" : "CREATE ON YOUR PROFILE"}</span><h2>{editing ? "Refine your update" : "Share with your campus"}</h2></div><span>{remaining.toLocaleString()} characters</span></div>
    <label className="sr-only" htmlFor={editing ? `social-body-${initialPost!.id}` : "social-body"}>Post text</label>
    <TextArea id={editing ? `social-body-${initialPost!.id}` : "social-body"} value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={5} placeholder="What should your campus know?" required autoFocus={autoFocus} />
    {(existingMedia.length > 0 || images.length > 0) && <div className="social-media-editor" aria-label="Post images">
      {existingMedia.map((media) => <div className="social-media-edit-item" key={media.id}><img src={`/api/v1/media/${media.id}?variant=thumb`} alt={media.alt_text} /><button type="button" aria-label="Remove existing image" onClick={() => setExistingMedia((value) => value.filter((item) => item.id !== media.id))}><Trash2 /></button><small>{media.alt_text || "Decorative image"}</small></div>)}
      {images.map((image) => <div className="social-media-edit-item" key={image.key}><img src={image.preview} alt="Selected preview" /><button type="button" aria-label="Remove selected image" onClick={() => removeImage(image.key)}><X /></button><label>Image description<input value={image.alt} disabled={image.decorative} maxLength={300} onChange={(event) => setImages((value) => value.map((item) => item.key === image.key ? { ...item, alt: event.target.value } : item))} /></label><label className="social-decorative-choice"><input type="checkbox" checked={image.decorative} onChange={(event) => setImages((value) => value.map((item) => item.key === image.key ? { ...item, decorative: event.target.checked } : item))} /> Decorative</label>{image.error && <small className="form-error">{image.error}</small>}</div>)}
    </div>}
    <div className="composer-footer">
      <div className="composer-options"><label className="social-media-picker"><ImagePlus aria-hidden="true" /> Add images<input type="file" accept={mediaAccept} multiple disabled={mediaCount >= 4 || busy} onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} /></label><Select aria-label="Post audience" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="campus_only">My campus</option><option value="friends">Friends</option>{networkEnabled && <option value="network">Campus Exchange network</option>}</Select></div>
      <div className="composer-actions">{onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}<Button type="submit" busy={busy} disabled={!canSubmit}>{busy ? <LoaderCircle aria-hidden="true" /> : <Send aria-hidden="true" />}{editing ? "Save changes" : "Publish"}</Button></div>
    </div>
    {notice && <p className={notice.includes("Unable") || notice.includes("Describe") || notice.includes("Unsupported") ? "form-error" : "form-notice"} role="status">{notice}</p>}
  </form>;
}
