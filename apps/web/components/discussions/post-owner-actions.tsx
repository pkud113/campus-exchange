"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  uploadDiscussionImage,
  validateDiscussionImage,
} from "@/lib/discussion-upload-client";
import { DiscussionImagePreview } from "./discussion-image-preview";

type EditablePost = {
  title: string;
  body: string | null;
  link_url: string | null;
  post_type: "text" | "link" | "image";
  media_id: string | null;
};

export function PostOwnerActions({ postId, slug, post }: { postId: string; slug: string; post: EditablePost }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaId, setMediaId] = useState(post.media_id);
  const [uploadFailed, setUploadFailed] = useState(false);

  function selectImage(file: File | null) {
    setError("");
    setUploadFailed(false);
    if (!file) return setSelectedFile(null);
    const validation = validateDiscussionImage(file);
    if (validation) {
      setSelectedFile(null);
      setError(validation);
      return;
    }
    setSelectedFile(file);
  }

  async function uploadReplacement(title: string) {
    if (!selectedFile) return mediaId;
    setUploadFailed(false);
    try {
      const uploaded = await uploadDiscussionImage({ file: selectedFile, altText: title, onProgress: setProgress });
      setMediaId(uploaded.id);
      setSelectedFile(null);
      setProgress("Replacement image ready.");
      return uploaded.id;
    } catch (cause) {
      setUploadFailed(true);
      throw cause;
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const nextMediaId = post.post_type === "image" ? await uploadReplacement(String(form.get("title") ?? post.title)) : null;
      const response = await fetch(`/api/v1/discussions/posts/${postId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postType: post.post_type,
          title: form.get("title"),
          body: form.get("body") ?? "",
          linkUrl: post.post_type === "link" ? form.get("linkUrl") || null : null,
          mediaId: nextMediaId,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to update post.");
      setMediaId(result.data.media_id ?? nextMediaId);
      setEditing(false);
      setProgress("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update post.");
    } finally {
      setBusy(false);
    }
  }

  async function retryUpload() {
    setBusy(true);
    setError("");
    try {
      await uploadReplacement(post.title);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload the image.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this post? Replies will remain as a preserved thread.")) return;
    const response = await fetch(`/api/v1/discussions/posts/${postId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Author deleted post" }),
    });
    if (response.ok) {
      router.push(`/discussions/c/${slug}`);
      router.refresh();
    }
  }

  return <div className="owner-actions">
    <button className="button button-small button-ghost" onClick={() => setEditing(!editing)}>{editing ? "Cancel edit" : "Edit post"}</button>
    <button className="button button-small button-danger" onClick={() => void remove()}>Delete post</button>
    {editing && <form className="inline-editor" onSubmit={save}>
      <label>Title<input name="title" defaultValue={post.title} minLength={3} maxLength={300} required disabled={busy}/></label>
      {post.post_type === "image" && <label>Replace image (optional)
        <input type="file" accept="image/webp,image/png,image/jpeg,image/heic,image/heif,.heic,.heif" disabled={busy} onChange={(event) => selectImage(event.target.files?.[0] ?? null)}/>
        {selectedFile ? <DiscussionImagePreview file={selectedFile} compact/> : mediaId ? <img className="discussion-edit-image" src={`/api/v1/media/${mediaId}?variant=card`} alt="Post image preview"/> : null}
      </label>}
      {post.post_type === "link" && <label>HTTPS link<input name="linkUrl" defaultValue={post.link_url ?? ""} type="url" pattern="https://.*" required disabled={busy}/></label>}
      <label>{post.post_type === "text" ? "Body" : post.post_type === "image" ? "Text beneath image (optional)" : "Commentary (optional)"}<textarea name="body" defaultValue={post.body ?? ""} maxLength={20000} required={post.post_type === "text"} disabled={busy}/></label>
      {progress && <p className="form-notice" role="status">{progress}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {uploadFailed && selectedFile && <button type="button" className="button button-small button-ghost" disabled={busy} onClick={() => void retryUpload()}><RefreshCw/>Retry upload</button>}
      <button className="button button-small button-primary" disabled={busy}>{busy ? <><LoaderCircle className="spin"/>Saving…</> : "Save changes"}</button>
    </form>}
  </div>;
}
