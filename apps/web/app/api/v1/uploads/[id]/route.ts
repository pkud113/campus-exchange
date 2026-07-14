import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiData, apiError, requireVerified } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  ImageValidationError,
  persistPreparedImage,
  prepareImageForStorage,
  type CloudflareImagesBinding,
} from "@/lib/image-processing";
import {
  maxImageBytes,
  normalizedImageType,
  type ListingImageType,
} from "@/lib/images";

type MediaEnv = {
  MEDIA_BUCKET: {
    put: (
      key: string,
      value: ArrayBuffer,
      options?: unknown,
    ) => Promise<unknown | null>;
  };
  IMAGES: CloudflareImagesBinding;
};
type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const origin = request.headers.get("origin");
  if (origin && process.env.APP_ORIGIN && origin !== process.env.APP_ORIGIN) {
    return apiError(request, 403, "forbidden", "Request origin was rejected.");
  }
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: upload } = await context.supabase
    .from("media_uploads")
    .select(
      "id,uploader_id,object_key,content_type,byte_size,status,expires_at,purpose",
    )
    .eq("id", id)
    .single();
  if (!upload) {
    return apiError(request, 404, "not_found", "Upload grant not found.");
  }
  if (
    upload.uploader_id !== context.userId ||
    upload.status !== "pending" ||
    new Date(upload.expires_at) <= new Date()
  ) {
    return apiError(
      request,
      403,
      "forbidden",
      "This upload grant is no longer valid.",
    );
  }

  const declaredType = upload.content_type as ListingImageType;
  const requestType = normalizedImageType(request.headers.get("content-type"));
  if (requestType !== declaredType) {
    return apiError(
      request,
      400,
      "bad_request",
      "The selected file type does not match the upload grant.",
    );
  }

  const admin = createSupabaseAdminClient();
  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return apiError(request, 400, "bad_request", "The image could not be read.");
  }
  if (
    bytes.byteLength <= 0 ||
    bytes.byteLength !== upload.byte_size ||
    bytes.byteLength > maxImageBytes
  ) {
    await admin
      .from("media_uploads")
      .update({ status: "rejected" })
      .eq("id", id)
      .eq("uploader_id", context.userId);
    return apiError(
      request,
      400,
      "bad_request",
      "The received image size does not match the selected file.",
    );
  }

  let stage = "validation";
  try {
    const { env } = getCloudflareContext() as unknown as { env: MediaEnv };
    const prepared = await prepareImageForStorage({
      bytes,
      declaredType,
      images: env.IMAGES,
    });
    if (!prepared.optimized) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "image_optimization_fallback",
          requestId: context.requestId,
          uploadId: id,
          stage: "transform",
          message: prepared.optimizationError,
        }),
      );
    }

    stage = "r2-put";
    await persistPreparedImage({
      put: () =>
        env.MEDIA_BUCKET.put(upload.object_key, prepared.bytes, {
          httpMetadata: {
            contentType: prepared.contentType,
            cacheControl: "private, max-age=86400",
          },
          customMetadata: {
            campusId: context.campusId,
            uploaderId: context.userId,
            purpose: upload.purpose,
            optimized: String(prepared.optimized),
          },
        }),
      markReady: async () => {
        stage = "database-ready";
        const { error: updateError } = await admin
          .from("media_uploads")
          .update({ status: "ready", content_type: prepared.contentType })
          .eq("id", id)
          .eq("uploader_id", context.userId);
        if (updateError) throw updateError;
      },
    });

    if (upload.purpose === "avatar" || upload.purpose === "banner") {
      stage = "profile-attachment";
      const { error: attachError } = await context.supabase.rpc(
        "attach_profile_media",
        { target_media: id, target_purpose: upload.purpose },
      );
      if (attachError) {
        await admin
          .from("media_uploads")
          .update({ status: "pending" })
          .eq("id", id)
          .eq("uploader_id", context.userId);
        throw attachError;
      }
    }
    return apiData(request, {
      id,
      status: "ready",
      optimized: prepared.optimized,
      storedContentType: prepared.contentType,
      mediaUrl: `/api/v1/media/${id}?variant=${upload.purpose === "avatar" ? "thumb" : "full"}`,
    });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      await admin
        .from("media_uploads")
        .update({ status: "rejected" })
        .eq("id", id)
        .eq("uploader_id", context.userId);
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "image_upload_rejected",
          requestId: context.requestId,
          uploadId: id,
          stage,
          message: error.message,
        }),
      );
      return apiError(request, 415, "bad_request", error.message);
    }
    console.error(
      JSON.stringify({
        level: "error",
        event: "image_upload_failed",
        requestId: context.requestId,
        uploadId: id,
        stage,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return apiError(
      request,
      503,
      "service_unconfigured",
      "Image storage is temporarily unavailable. The upload can be retried.",
    );
  }
}
