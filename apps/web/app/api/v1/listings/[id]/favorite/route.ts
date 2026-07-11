import { apiData, apiError, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
type Params = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Params) { const e=verifyMutationOrigin(request); if(e)return e; const c=await requireVerified(request); if(c instanceof NextResponse)return c; const {id}=await params; const {error}=await c.supabase.from("favorites").upsert({profile_id:c.userId,listing_id:id,campus_id:c.campusId}); return error?apiError(request,400,"bad_request","Unable to save this listing."):apiData(request,{favorite:true}); }
export async function DELETE(request: Request, { params }: Params) { const c=await requireVerified(request); if(c instanceof NextResponse)return c; const {id}=await params; await c.supabase.from("favorites").delete().eq("profile_id",c.userId).eq("listing_id",id); return apiData(request,{favorite:false}); }
