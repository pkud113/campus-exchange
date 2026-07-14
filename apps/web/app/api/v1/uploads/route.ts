import { z } from "zod";
import { apiData, apiError, enforceRateLimit, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const schema=z.object({listingId:z.string().uuid().optional(),purpose:z.enum(["listing","avatar","banner"]).default("listing"),contentType:z.enum(["image/webp","image/png","image/jpeg"]),byteSize:z.number().int().min(1).max(8*1024*1024),altText:z.string().trim().max(300).default("")}).refine(value=>value.purpose==="listing"?Boolean(value.listingId):!value.listingId,{message:"Upload target does not match its purpose"});
export async function POST(request:Request){
  const e=verifyMutationOrigin(request);if(e)return e;const c=await requireVerified(request);if(c instanceof NextResponse)return c;const limited=await enforceRateLimit(request,"upload",c.userId,30,3600);if(limited)return limited;const input=await parseJson(request,schema);if(input instanceof NextResponse)return input;
  if(input.purpose==="listing"){
    const{data:listing}=await c.supabase.from("listings").select("seller_id,deleted_at").eq("id",input.listingId!).single();
    if(!listing||listing.seller_id!==c.userId||listing.deleted_at)return apiError(request,403,"forbidden","You can only upload images to your own active listing.");
    const{count}=await c.supabase.from("media_uploads").select("id",{count:"exact",head:true}).eq("listing_id",input.listingId!).in("status",["pending","ready"]);
    if((count??0)>=6)return apiError(request,409,"conflict","A listing can have at most six images.");
  }
  const id=crypto.randomUUID();const objectKey=`${c.campusId}/${c.userId}/${input.purpose}/${id}.webp`;
  const{error}=await createSupabaseAdminClient().from("media_uploads").insert({id,campus_id:c.campusId,uploader_id:c.userId,listing_id:input.purpose==="listing"?input.listingId:null,profile_id:input.purpose==="listing"?null:c.userId,purpose:input.purpose,object_key:objectKey,content_type:input.contentType,byte_size:input.byteSize,alt_text:input.altText});
  return error?apiError(request,400,"bad_request","Unable to prepare this upload. Check the file and try again."):apiData(request,{id,uploadUrl:`/api/v1/uploads/${id}`,expiresInSeconds:600},201);
}
