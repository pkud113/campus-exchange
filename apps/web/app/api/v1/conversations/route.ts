import { z } from "zod";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
const schema=z.object({listingId:z.string().uuid()});
export async function GET(request:Request){const c=await requireVerified(request);if(c instanceof NextResponse)return c;const {data,error}=await c.supabase.from("conversations").select("id,listing_id,last_message_at,listings(title),conversation_participants(profile_id,profiles(handle,display_name))").order("last_message_at",{ascending:false});return error?apiError(request,500,"internal_error","Unable to load conversations."):apiData(request,data??[]);}
export async function POST(request:Request){const e=verifyMutationOrigin(request);if(e)return e;const c=await requireVerified(request);if(c instanceof NextResponse)return c;const input=await parseJson(request,schema);if(input instanceof NextResponse)return input;const {data,error}=await c.supabase.rpc("create_listing_conversation",{target_listing:input.listingId});return error?apiError(request,409,"conflict",error.message):apiData(request,{id:data},201);}
