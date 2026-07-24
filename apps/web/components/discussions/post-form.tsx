"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  discussionFileKey,
  uploadDiscussionImage,
  validateDiscussionImage,
} from "@/lib/discussion-upload-client";
import { DiscussionImagePreview } from "./discussion-image-preview";
import { ModerationReviewButton, moderationIssueFrom, type ModerationIssue } from "@/components/moderation-review-button";

type PostType = "text" | "link" | "image";

export function DiscussionPostForm({ slug }: { slug: string }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const [postType, setPostType] = useState<PostType>("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<{ fileKey: string; mediaId: string } | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [moderationIssue,setModerationIssue]=useState<ModerationIssue|null>(null);

  function selectImage(file: File | null) {
    setError("");
    setModerationIssue(null);
    setUploadFailed(false);
    setUploaded(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validation = validateDiscussionImage(file);
    if (validation) {
      setSelectedFile(null);
      setError(validation);
      return;
    }
    setSelectedFile(file);
  }

  async function ensureUploaded(file: File, title: string) {
    const fileKey = discussionFileKey(file);
    if (uploaded?.fileKey === fileKey) return uploaded.mediaId;
    setUploadFailed(false);
    try {
      const result = await uploadDiscussionImage({ file, altText: title || "Discussion post image", onProgress: setProgress });
      setUploaded({ fileKey, mediaId: result.id });
      setProgress("Image ready to publish.");
      return result.id;
    } catch (cause) {
      setUploadFailed(true);
      throw cause;
    }
  }

  async function retryUpload() {
    if (!selectedFile) return;
    setBusy(true);
    setError("");
    try {
      await ensureUploaded(selectedFile, "Discussion post image");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload the image.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    try {
      let mediaId: string | null = null;
      if (postType === "image") {
        if (!selectedFile) throw new Error("Choose an image.");
        mediaId = await ensureUploaded(selectedFile, String(form.get("title") ?? "Discussion post image"));
      }
      setProgress("Publishing post…");
      const response = await fetch(`/api/v1/discussions/communities/${slug}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postType,
          title: form.get("title"),
          body: form.get("body") ?? "",
          linkUrl: postType === "link" ? form.get("linkUrl") : null,
          mediaId,
          idempotencyKey: key.current,
        }),
      });
      const result = await response.json();
      if (!response.ok){setModerationIssue(moderationIssueFrom(result));throw new Error(result.error?.message ?? "Unable to publish this post.");}
      router.push(`/discussions/c/${slug}/posts/${result.data.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to publish this post.");
      setBusy(false);
      setProgress("");
    }
  }

  return <form className="listing-form discussion-form" onSubmit={submit}>
    <section>
      <h2>Post type</h2>
      <div className="post-type-tabs" role="tablist" aria-label="Post type">
        {(["text", "link", "image"] as const).map((type) => <button type="button" role="tab" aria-selected={postType === type} className={postType === type ? "active" : ""} onClick={() => setPostType(type)} key={type}>{type}</button>)}
      </div>
      <label>Title<input name="title" minLength={3} maxLength={300} required disabled={busy}/></label>
      {postType === "link" && <label>HTTPS link<input name="linkUrl" type="url" pattern="https://.*" required disabled={busy}/></label>}
      {postType === "image" && <label className="discussion-image-picker">
        Image
        <input name="image" type="file" accept="image/webp,image/png,image/jpeg,image/heic,image/heif,.heic,.heif" required={!selectedFile} disabled={busy} onChange={(event) => selectImage(event.target.files?.[0] ?? null)}/>
        <small>Private JPEG, PNG, WebP, HEIC, or HEIF · 20 MB maximum</small>
        {selectedFile && <DiscussionImagePreview file={selectedFile}/>}
      </label>}
      <label>{postType === "text" ? "Body" : postType === "image" ? "Text beneath image (optional)" : "Commentary (optional)"}<textarea name="body" rows={8} maxLength={20000} required={postType === "text"} disabled={busy}/></label>
    </section>
    {progress && <p className="form-notice" role="status">{progress}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {moderationIssue&&<ModerationReviewButton issue={moderationIssue} onStatus={setError} onReviewed={() => setModerationIssue(null)}/>}
    {uploadFailed && selectedFile && <button type="button" className="button button-ghost" disabled={busy} onClick={() => void retryUpload()}><RefreshCw/>Retry image upload</button>}
    <button className="button button-primary" disabled={busy}>{busy ? <><LoaderCircle className="spin"/>Working…</> : "Publish post"}</button>
  </form>;
}
