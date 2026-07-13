import { z } from "zod";
import { NextResponse } from "next/server";
import { apiData, apiError, parseJson, verifyMutationOrigin } from "@/lib/api";
import { resolveLoginEmail } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema=z.object({identifier:z.string().trim().min(3).max(254),token:z.string().regex(/^\d{6}$/)});
export async function POST(request:Request){const originError=verifyMutationOrigin(request);if(originError)return originError;const input=await parseJson(request,schema);if(input instanceof NextResponse)return input;const email=await resolveLoginEmail(input.identifier);if(!email)return apiError(request,400,"bad_request","That recovery code is invalid or expired.");const{error}=await(await createSupabaseServerClient()).auth.verifyOtp({email,token:input.token,type:"recovery"});return error?apiError(request,400,"bad_request","That recovery code is invalid or expired."):apiData(request,{verified:true})}
