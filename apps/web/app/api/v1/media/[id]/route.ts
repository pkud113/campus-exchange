import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError, requireVerified } from "@/lib/api";
import { NextResponse } from "next/server";
import {
  transformImageForDelivery,
  type CloudflareImagesBinding,
} from "@/lib/image-processing";

type R2ObjectBody = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
};
type MediaEnv = {
  MEDIA_BUCKET: { get: (key: string) => Promise<R2ObjectBody | null> };
  IMAGES: CloudflareImagesBinding;
};
type Params = { params: Promise<{ id: string }> };

const variantWidths = { thumb: 320, card: 720, full: 1600 } as const;

export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data } = await context.supabase
    .from("media_uploads")
    .select("object_key,status,campus_id,content_type")
    .eq("id", id)
    .single();
  if (!data || data.status !== "ready" || data.campus_id !== context.campusId) {
    return apiError(request, 404, "not_found", "Media not found.");
  }

  try {
    const { env } = getCloudflareContext() as unknown as { env: MediaEnv };
    const object = await env.MEDIA_BUCKET.get(data.object_key);
    if (!object) {
      return apiError(request, 404, "not_found", "Media not found.");
    }
    const requestedVariant = new URL(request.url).searchParams.get("variant");
    const variant =
      requestedVariant && requestedVariant in variantWidths
        ? (requestedVariant as keyof typeof variantWidths)
        : "card";
    const original = await object.arrayBuffer();
    const result = await transformImageForDelivery({
      bytes: original,
      width: variantWidths[variant],
      images: env.IMAGES,
    });
    if (!result.optimized) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "image_delivery_fallback",
          requestId: context.requestId,
          mediaId: id,
          variant,
          message: result.error,
        }),
      );
    }
    const contentType = result.optimized
      ? "image/webp"
      : object.httpMetadata?.contentType || data.content_type;
    return new Response(result.bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(result.bytes.byteLength),
        "cache-control": "private, no-store",
        "content-disposition": "inline",
        "content-security-policy": "default-src 'none'",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "image_delivery_failed",
        requestId: context.requestId,
        mediaId: id,
        stage: "r2-get",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return apiError(
      request,
      503,
      "internal_error",
      "Media is temporarily unavailable.",
    );
  }
}
