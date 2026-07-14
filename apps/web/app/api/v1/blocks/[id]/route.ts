import { apiData, apiError, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

type Params={params:Promise<{id:string}>};
export async function POST(request:Request,{params}:Params){const originError=verifyMutationOrigin(request);if(originError)return originError;const context=await requireVerified(request);if(context instanceof NextResponse)return context;const{id}=await params;const{error}=await context.supabase.rpc("set_profile_block",{target_profile:id,desired:true});return error?apiError(request,400,"bad_request",error.message):apiData(request,{blocked:true})}
export async function DELETE(request:Request,{params}:Params){const originError=verifyMutationOrigin(request);if(originError)return originError;const context=await requireVerified(request);if(context instanceof NextResponse)return context;const{id}=await params;const{error}=await context.supabase.rpc("set_profile_block",{target_profile:id,desired:false});return error?apiError(request,400,"bad_request",error.message):apiData(request,{blocked:false})}
