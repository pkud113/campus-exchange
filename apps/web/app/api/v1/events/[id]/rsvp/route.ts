import { apiData, apiError, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
type Params={params:Promise<{id:string}>};
export async function POST(request:Request,{params}:Params){const e=verifyMutationOrigin(request);if(e)return e;const c=await requireVerified(request);if(c instanceof NextResponse)return c;const {id}=await params;const {error}=await c.supabase.rpc("rsvp_to_event",{target_event:id});return error?apiError(request,409,"conflict",error.message):apiData(request,{attending:true});}
export async function DELETE(request:Request,{params}:Params){const e=verifyMutationOrigin(request);if(e)return e;const c=await requireVerified(request);if(c instanceof NextResponse)return c;const {id}=await params;const{error}=await c.supabase.rpc("cancel_event_rsvp",{target_event:id});return error?apiError(request,400,"bad_request","Unable to cancel this RSVP."):apiData(request,{attending:false});}
