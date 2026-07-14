import { z } from "zod";
import {
  apiData,
  apiError,
  enforceRateLimit,
  parseJson,
  requireVerified,
  verifyMutationOrigin,
} from "@/lib/api";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listingImageTypes, maxImageBytes } from "@/lib/images";

const schema = z
  .object({
    listingId: z.string().uuid().optional(),
    communitySlug: z.string().regex(/^[a-z0-9_]{3,32}$/).optional(),
    purpose: z.enum(["listing", "avatar", "banner", "community_icon", "community_banner", "discussion_post"]).default("listing"),
    contentType: z.enum(listingImageTypes),
    byteSize: z.number().int().min(1).max(maxImageBytes),
    altText: z.string().trim().max(300).default(""),
  })
  .refine(
    (value) => {
      if (value.purpose === "listing") return Boolean(value.listingId) && !value.communitySlug;
      if (value.purpose === "community_icon" || value.purpose === "community_banner") return Boolean(value.communitySlug) && !value.listingId;
      return !value.listingId && !value.communitySlug;
    },
    { message: "Upload target does not match its purpose" },
  );

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request);
  if (originError) return originError;
  const context = await requireVerified(request);
  if (context instanceof NextResponse) return context;
  const limited = await enforceRateLimit(
    request,
    "upload",
    context.userId,
    30,
    3600,
  );
  if (limited) return limited;
  const input = await parseJson(request, schema);
  if (input instanceof NextResponse) return input;

  const admin = createSupabaseAdminClient();
  if (input.purpose === "listing") {
    const { data: listing } = await context.supabase
      .from("listings")
      .select("seller_id,deleted_at")
      .eq("id", input.listingId!)
      .single();
    if (
      !listing ||
      listing.seller_id !== context.userId ||
      listing.deleted_at
    ) {
      return apiError(
        request,
        403,
        "forbidden",
        "You can only upload images to your own active listing.",
      );
    }
    await admin
      .from("media_uploads")
      .update({ status: "rejected" })
      .eq("listing_id", input.listingId!)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());
    const { count } = await context.supabase
      .from("media_uploads")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", input.listingId!)
      .in("status", ["pending", "ready"]);
    if ((count ?? 0) >= 6) {
      return apiError(
        request,
        409,
        "conflict",
        "A listing can have at most six images.",
      );
    }
  }
  if (input.purpose === "community_icon" || input.purpose === "community_banner") {
    const { data: community } = await context.supabase
      .from("discussion_communities")
      .select("owner_id,deleted_at")
      .eq("slug", input.communitySlug!)
      .single();
    if (!community || community.owner_id !== context.userId || community.deleted_at) {
      return apiError(request, 403, "forbidden", "Only the community owner can upload community media.");
    }
  }

  const id = crypto.randomUUID();
  const objectKey = `${context.campusId}/${context.userId}/${input.purpose}/${id}`;
  const { error } = await admin.from("media_uploads").insert({
    id,
    campus_id: context.campusId,
    uploader_id: context.userId,
    listing_id: input.purpose === "listing" ? input.listingId : null,
    profile_id: input.purpose === "avatar" || input.purpose === "banner" ? context.userId : null,
    purpose: input.purpose,
    object_key: objectKey,
    content_type: input.contentType,
    byte_size: input.byteSize,
    alt_text: input.altText,
  });
  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "image_upload_grant_failed",
        requestId: context.requestId,
        stage: "database-grant",
        message: error.message,
      }),
    );
    return apiError(
      request,
      400,
      "bad_request",
      "Unable to prepare this upload. Check the file and try again.",
    );
  }
  return apiData(
    request,
    { id, uploadUrl: `/api/v1/uploads/${id}`, expiresInSeconds: 600 },
    201,
  );
}
