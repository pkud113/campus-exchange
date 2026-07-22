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
import { authorizeSharedTextMutation } from "@/lib/content-moderation";

const schema = z
  .object({
    listingId: z.string().uuid().optional(),
    communitySlug: z.string().regex(/^[a-z0-9_]{3,32}$/).optional(),
    organizationId: z.string().uuid().optional(),
    purpose: z.enum(["listing", "avatar", "banner", "community_icon", "community_banner", "discussion_post", "organization_avatar", "organization_banner", "social_post"]).default("listing"),
    contentType: z.enum(listingImageTypes),
    byteSize: z.number().int().min(1).max(maxImageBytes),
    altText: z.string().trim().max(300).default(""),
  })
  .refine(
    (value) => {
      if (value.purpose === "listing") return Boolean(value.listingId) && !value.communitySlug && !value.organizationId;
      if (value.purpose === "community_icon" || value.purpose === "community_banner") return Boolean(value.communitySlug) && !value.listingId && !value.organizationId;
      if (value.purpose === "organization_avatar" || value.purpose === "organization_banner") return Boolean(value.organizationId) && !value.listingId && !value.communitySlug;
      return !value.listingId && !value.communitySlug && !value.organizationId;
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
  if(input.altText){const moderation=await authorizeSharedTextMutation(request,context,{surface:"media_alt_text",operation:"create",fields:{altText:input.altText}});if(moderation instanceof Response)return moderation;}

  const admin = createSupabaseAdminClient();
  let mediaCampusId = context.campusId;
  let organizationId: string | null = null;
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
  if (input.purpose === "organization_avatar" || input.purpose === "organization_banner") {
    const [{ data: membership }, { data: organization }] = await Promise.all([
      context.supabase
        .from("organization_memberships")
        .select("role,status")
        .eq("organization_id", input.organizationId!)
        .eq("profile_id", context.userId)
        .single(),
      context.supabase
        .from("organizations")
        .select("id,campus_id,status")
        .eq("id", input.organizationId!)
        .single(),
    ]);
    if (!membership || membership.status !== "active" || !["owner", "administrator"].includes(membership.role) || !organization || organization.status !== "active") {
      return apiError(request, 403, "forbidden", "Organization administrators manage organization media.");
    }
    organizationId = organization.id;
    mediaCampusId = organization.campus_id;
  }

  const id = crypto.randomUUID();
  const objectKey = `${mediaCampusId}/${context.userId}/${input.purpose}/${id}`;
  const { error } = await admin.from("media_uploads").insert({
    id,
    campus_id: mediaCampusId,
    uploader_id: context.userId,
    listing_id: input.purpose === "listing" ? input.listingId : null,
    profile_id: input.purpose === "avatar" || input.purpose === "banner" ? context.userId : null,
    organization_id: organizationId,
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
