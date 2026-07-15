import { z } from "zod";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { notificationHref } from "@/lib/notification-href";
import { NextResponse } from "next/server";
export async function GET(request:Request){const c=await requireVerified(request);if(c instanceof NextResponse)return c;const {data,error}=await c.supabase.from("notifications").select("id,kind,title,body,href,read_at,created_at").order("created_at",{ascending:false}).limit(50);return error?apiError(request,500,"internal_error","Unable to load notifications."):apiData(request,(data??[]).map((item)=>({...item,href:notificationHref(item.href,item.kind)})));}
const schema=z.object({notificationId:z.string().uuid().nullable().optional()});
export async function PATCH(request:Request){const e=verifyMutationOrigin(request);if(e)return e;const c=await requireVerified(request);if(c instanceof NextResponse)return c;const input=await parseJson(request,schema);if(input instanceof NextResponse)return input;const{data,error}=await c.supabase.rpc("mark_notifications_read",{target_notification:input.notificationId??null});return error?apiError(request,400,"bad_request","Unable to mark notifications as read."):apiData(request,{read:true,count:data??0});}
