import { contentModerationReviewSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, enforceRateLimit, mutationError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";

export async function POST(request: Request) {
  const originError=verifyMutationOrigin(request);if(originError)return originError;
  const context=await requireVerified(request);if(context instanceof NextResponse)return context;
  const limited=await enforceRateLimit(request,"content-moderation-review",context.userId,10,3600);if(limited)return limited;
  const input=await parseJson(request,contentModerationReviewSchema);if(input instanceof NextResponse)return input;
  const{data,error}=await context.supabase.rpc("request_content_moderation_review",{target_check:input.checkId,request_key:input.idempotencyKey});
  return error?mutationError(request,error,"Unable to request staff review."):apiData(request,{caseId:data,status:"submitted"},201);
}
