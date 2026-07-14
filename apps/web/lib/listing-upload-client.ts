"use client";

import {
  maxImageBytes,
  normalizedImageType,
  type ListingImageType,
} from "./images";

export type UploadFailure = { file: File; message: string; requestId?: string };

export function listingFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function validateListingFiles(files: File[]) {
  for (const file of files) {
    const contentType = normalizedImageType(file.type, file.name);
    if (!contentType) {
      return `${file.name} must be a JPEG, PNG, WebP, HEIC, or HEIF image.`;
    }
    if (file.size <= 0 || file.size > maxImageBytes) {
      return `${file.name} must be no larger than 20 MB.`;
    }
  }
  return null;
}

async function errorDetail(response: Response) {
  const body = await response.json().catch(() => null);
  return {
    message: body?.error?.message as string | undefined,
    requestId: body?.error?.requestId as string | undefined,
  };
}

async function uploadOne({
  listingId,
  title,
  file,
}: {
  listingId: string;
  title: string;
  file: File;
}): Promise<UploadFailure | null> {
  const contentType = normalizedImageType(file.type, file.name) as ListingImageType;
  for (let grantAttempt = 0; grantAttempt < 2; grantAttempt += 1) {
    const grant = await fetch("/api/v1/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingId,
        purpose: "listing",
        contentType,
        byteSize: file.size,
        altText: title,
      }),
    }).catch(() => null);
    if (!grant) return { file, message: "The upload service could not be reached." };
    if (!grant.ok) {
      const detail = await errorDetail(grant);
      return {
        file,
        message: detail.message ?? "The upload could not be prepared.",
        ...(detail.requestId ? { requestId: detail.requestId } : {}),
      };
    }
    const grantBody = await grant.json().catch(() => null);
    const uploadUrl = grantBody?.data?.uploadUrl;
    if (typeof uploadUrl !== "string") {
      return { file, message: "The upload service returned an invalid response." };
    }

    let shouldRegrant = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: file,
      }).catch(() => null);
      if (response?.ok) return null;
      if (!response) {
        if (attempt < 2) continue;
        return { file, message: "The image upload was interrupted." };
      }
      if (response.status === 403 && grantAttempt === 0) {
        shouldRegrant = true;
        break;
      }
      if (response.status >= 500 && attempt < 2) continue;
      const detail = await errorDetail(response);
      return {
        file,
        message: detail.message ?? "The image upload failed.",
        ...(detail.requestId ? { requestId: detail.requestId } : {}),
      };
    }
    if (!shouldRegrant) {
      return { file, message: "The image service remained unavailable after retrying." };
    }
  }
  return { file, message: "The image upload grant expired. Please retry." };
}

export async function uploadListingFiles({
  listingId,
  title,
  files,
  uploadedKeys,
  onProgress,
}: {
  listingId: string;
  title: string;
  files: File[];
  uploadedKeys: Set<string>;
  onProgress: (message: string) => void;
}) {
  const failures: UploadFailure[] = [];
  const remaining = files.filter((file) => !uploadedKeys.has(listingFileKey(file)));
  for (const [index, file] of remaining.entries()) {
    onProgress(`Uploading image ${index + 1} of ${remaining.length}…`);
    const failure = await uploadOne({ listingId, title, file });
    if (failure) failures.push(failure);
    else uploadedKeys.add(listingFileKey(file));
  }
  return failures;
}

export function formatUploadFailures(failures: UploadFailure[]) {
  return failures
    .map(({ file, message, requestId }) =>
      `${file.name}: ${message}${requestId ? ` Support code: ${requestId}` : ""}`,
    )
    .join(" ");
}
