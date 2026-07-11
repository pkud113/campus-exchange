import { z } from "zod";
import { apiData, apiError, parseJson, requireStaff, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
const schema=z.object({action:z.enum(["dismiss","warn","hide_content","suspend","restore"]),reason:z.string().trim().min(3).max(1000)});type Params={params:Promise<{id:string}>};
export async function POST(request:Request,{params}:Params){const e=verifyMutationOrigin(request);if(e)return e;const c=await requireStaff(request);if(c instanceof NextResponse)return c;const input=await parseJson(request,schema);if(input instanceof NextResponse)return input;const {id}=await params;const {error}=await c.supabase.rpc("moderate_report",{target_report:id,chosen_action:input.action,action_reason:input.reason});return error?apiError(request,409,"conflict",error.message):apiData(request,{resolved:true});}
