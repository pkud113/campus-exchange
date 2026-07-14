import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiData, apiError, requireVerified } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { detectedImageType } from "@/lib/images";
type MediaEnv={MEDIA_BUCKET:{put:(key:string,value:ReadableStream<Uint8Array>,options?:unknown)=>Promise<unknown>};IMAGES:{input:(stream:ReadableStream<Uint8Array>)=>{transform:(options:unknown)=>{output:(options:unknown)=>Promise<{response:()=>Response}>}}}};
type Params={params:Promise<{id:string}>};
export async function PUT(request:Request,{params}:Params){
  const origin=request.headers.get("origin");if(origin&&process.env.APP_ORIGIN&&origin!==process.env.APP_ORIGIN)return apiError(request,403,"forbidden","Request origin was rejected.");
  const c=await requireVerified(request);if(c instanceof NextResponse)return c;const{id}=await params;const{data:upload}=await c.supabase.from("media_uploads").select("id,uploader_id,object_key,content_type,byte_size,status,expires_at,purpose").eq("id",id).single();
  if(!upload)return apiError(request,404,"not_found","Upload grant not found.");
  if(upload.uploader_id!==c.userId||upload.status!=="pending"||new Date(upload.expires_at)<=new Date())return apiError(request,403,"forbidden","This upload grant is no longer valid.");
  if(request.headers.get("content-type")?.split(";")[0]!==upload.content_type)return apiError(request,400,"bad_request","The selected file type does not match the upload grant.");
  let bytes:ArrayBuffer;try{bytes=await request.arrayBuffer()}catch{return apiError(request,400,"bad_request","The image could not be read.")}
  if(bytes.byteLength<=0||bytes.byteLength!==upload.byte_size||bytes.byteLength>8*1024*1024)return apiError(request,400,"bad_request","The received image size does not match the selected file.");
  if(detectedImageType(bytes)!==upload.content_type)return apiError(request,400,"bad_request","The image contents do not match the declared file type.");
  try{
    const{env}=getCloudflareContext() as unknown as{env:MediaEnv};const source=new Response(bytes).body!;const transformed=await env.IMAGES.input(source).transform({width:1600,height:1600,fit:"scale-down"}).output({format:"image/webp",quality:82,anim:false});const response=transformed.response();if(!response.ok||!response.body){await createSupabaseAdminClient().from("media_uploads").update({status:"rejected"}).eq("id",id).eq("uploader_id",c.userId);return apiError(request,415,"bad_request","The image could not be decoded. Export it as JPEG, PNG, or WebP and try again.")}
    await env.MEDIA_BUCKET.put(upload.object_key,response.body,{httpMetadata:{contentType:"image/webp",cacheControl:"private, max-age=86400"},customMetadata:{campusId:c.campusId,uploaderId:c.userId,purpose:upload.purpose}});
    const admin=createSupabaseAdminClient();const{error:updateError}=await admin.from("media_uploads").update({status:"ready",content_type:"image/webp"}).eq("id",id).eq("uploader_id",c.userId);if(updateError)throw updateError;
    if(upload.purpose!=="listing"){const{error:attachError}=await c.supabase.rpc("attach_profile_media",{target_media:id,target_purpose:upload.purpose});if(attachError)throw attachError}
    return apiData(request,{id,status:"ready",mediaUrl:`/api/v1/media/${id}?variant=${upload.purpose==="avatar"?"thumb":"full"}`});
  }catch(error){console.error(JSON.stringify({level:"error",event:"image_upload_failed",requestId:c.requestId,uploadId:id,message:error instanceof Error?error.message:"unknown"}));return apiError(request,503,"service_unconfigured","Image processing is temporarily unavailable. The upload can be retried.")}
}
