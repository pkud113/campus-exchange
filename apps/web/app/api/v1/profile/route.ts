import { expandedProfileInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.from("profiles").select("id,campus_id,handle,display_name,bio,academic_field,graduation_year,graduation_year_visible,academic_field_visible,interests,profile_visibility,friend_list_visibility,organization_membership_visibility,activity_visibility,status,verified_at,verified_until,created_at,avatar_media_id,banner_media_id,campuses(name,short_name,slug)").eq("id", context.userId).single();
  return error ? apiError(request, 500, "internal_error", "Unable to load your profile.") : apiData(request, data);
}

export async function PATCH(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, expandedProfileInputSchema); if (input instanceof NextResponse) return input;
  const{data:current}=await context.supabase.from("profiles").select("display_name,bio,academic_field,interests").eq("id",context.userId).single();
  const fields={...(current?.display_name===input.displayName?{}:{displayName:input.displayName}),...(current?.bio===input.biography?{}:{biography:input.biography}),...(current?.academic_field===input.academicField?{}:{academicField:input.academicField}),...(JSON.stringify(current?.interests??[])===JSON.stringify(input.interests)?{}:{interests:input.interests})};
  if(Object.keys(fields).length){const moderation = await authorizeSharedTextMutation(request, context, { surface: "profile", operation: "edit", fields, targetId: context.userId });if (moderation instanceof Response) return moderation;}
  const { data, error } = await context.supabase.from("profiles").update({ display_name: input.displayName, bio: input.biography, academic_field: input.academicField, graduation_year: input.graduationYear, graduation_year_visible: input.graduationYearVisible, academic_field_visible: input.academicFieldVisible, interests: input.interests, profile_visibility: input.visibility, friend_list_visibility: input.friendListVisibility, organization_membership_visibility: input.organizationMembershipVisibility, activity_visibility: input.activityVisibility }).eq("id", context.userId).select("id,handle,display_name,bio,academic_field,graduation_year,graduation_year_visible,academic_field_visible,interests,profile_visibility,friend_list_visibility,organization_membership_visibility,activity_visibility,avatar_media_id,banner_media_id").single();
  return error ? apiError(request, 500, "internal_error", "Unable to update your profile.") : apiData(request, data);
}
