"use client";

import {
  maxImageBytes,
  normalizedImageType,
  type ListingImageType,
} from "./images";

export type DiscussionUploadResult = {
  id: string;
  mediaUrl?: string;
};

export class DiscussionUploadError extends Error {
  constructor(message: string, public readonly requestId?: string) {
    super(requestId ? `${message} Support code: ${requestId}` : message);
    this.name = "DiscussionUploadError";
  }
}

export function discussionFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function validateDiscussionImage(file: File): string | null {
  if (!normalizedImageType(file.type, file.name)) {
    return "Choose a JPEG, PNG, WebP, HEIC, or HEIF image.";
  }
  if (file.size <= 0 || file.size > maxImageBytes) {
    return "Images must be 20 MB or smaller.";
  }
  return null;
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return new DiscussionUploadError(
    body?.error?.message ?? fallback,
    body?.error?.requestId,
  );
}

export async function uploadDiscussionImage({
  file,
  altText,
  onProgress,
}: {
  file: File;
  altText: string;
  onProgress: (message: string) => void;
}): Promise<DiscussionUploadResult> {
  const validation = validateDiscussionImage(file);
  if (validation) throw new DiscussionUploadError(validation);
  const contentType = normalizedImageType(file.type, file.name) as ListingImageType;

  for (let grantAttempt = 0; grantAttempt < 2; grantAttempt += 1) {
    onProgress(grantAttempt === 0 ? "Preparing private image upload…" : "Refreshing image upload grant…");
    const grant = await fetch("/api/v1/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "discussion_post",
        contentType,
        byteSize: file.size,
        altText,
      }),
    }).catch(() => null);

    if (!grant) {
      if (grantAttempt === 0) continue;
      throw new DiscussionUploadError("The upload service could not be reached.");
    }
    if (!grant.ok) {
      if (grant.status >= 500 && grantAttempt === 0) continue;
      throw await responseError(grant, "The upload could not be prepared.");
    }

    const grantBody = await grant.json().catch(() => null);
    const uploadUrl = grantBody?.data?.uploadUrl;
    if (typeof uploadUrl !== "string") {
      throw new DiscussionUploadError("The upload service returned an invalid response.");
    }

    let refreshGrant = false;
    for (let uploadAttempt = 0; uploadAttempt < 3; uploadAttempt += 1) {
      onProgress(uploadAttempt === 0 ? "Validating and storing image…" : "Retrying image upload…");
      const stored = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: file,
      }).catch(() => null);

      if (stored?.ok) {
        const storedBody = await stored.json().catch(() => null);
        const id = storedBody?.data?.id;
        if (typeof id !== "string") {
          throw new DiscussionUploadError("The image service returned an invalid response.");
        }
        return { id, ...(typeof storedBody?.data?.mediaUrl === "string" ? { mediaUrl: storedBody.data.mediaUrl } : {}) };
      }

      if (stored?.status === 403 && grantAttempt === 0) {
        refreshGrant = true;
        break;
      }
      if ((!stored || stored.status >= 500) && uploadAttempt < 2) continue;
      if (!stored) throw new DiscussionUploadError("The image upload was interrupted.");
      throw await responseError(stored, "The image upload failed.");
    }
    if (!refreshGrant) {
      throw new DiscussionUploadError("The image service remained unavailable after retrying.");
    }
  }

  throw new DiscussionUploadError("The image upload grant expired. Please retry.");
}
