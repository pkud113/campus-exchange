import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiData, apiError, requireVerified } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
type MediaEnv={MEDIA_BUCKET:{put:(key:string,value:ReadableStream<Uint8Array>,options?:unknown)=>Promise<unknown>};IMAGES:{input:(stream:ReadableStream<Uint8Array>)=>{transform:(options:unknown)=>{output:(options:unknown)=>Promise<{response:()=>Response}>}}}};
type Params={params:Promise<{id:string}>};
function detectedImageType(bytes:ArrayBuffer){const value=new Uint8Array(bytes);if(value.length>=3&&value[0]===0xff&&value[1]===0xd8&&value[2]===0xff)return"image/jpeg";if(value.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>value[index]===byte))return"image/png";if(value.length>=12&&String.fromCharCode(...value.slice(0,4))==="RIFF"&&String.fromCharCode(...value.slice(8,12))==="WEBP")return"image/webp";return null}
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
    const{env}=getCloudflareContext() as unknown as{env:MediaEnv};const source=new Response(bytes).body!;const transformed=await env.IMAGES.input(source).transform({width:1600,height:1600,fit:"scale-down"}).output({format:"image/webp",quality:82,anim:false});const response=transformed.response();if(!response.ok||!response.body)throw new Error("decode_failed");
    await env.MEDIA_BUCKET.put(upload.object_key,response.body,{httpMetadata:{contentType:"image/webp",cacheControl:"private, max-age=86400"},customMetadata:{campusId:c.campusId,uploaderId:c.userId,purpose:upload.purpose}});
    const admin=createSupabaseAdminClient();const{error:updateError}=await admin.from("media_uploads").update({status:"ready",content_type:"image/webp"}).eq("id",id).eq("uploader_id",c.userId);if(updateError)throw updateError;
    if(upload.purpose!=="listing"){const{error:attachError}=await c.supabase.rpc("attach_profile_media",{target_media:id,target_purpose:upload.purpose});if(attachError)throw attachError}
    return apiData(request,{id,status:"ready",mediaUrl:`/api/v1/media/${id}?variant=${upload.purpose==="avatar"?"thumb":"full"}`});
  }catch{await createSupabaseAdminClient().from("media_uploads").update({status:"rejected"}).eq("id",id).eq("uploader_id",c.userId);return apiError(request,400,"bad_request","The file is not a supported, decodable WebP, PNG, or JPEG image.")}
}
