import { moderationAppealDecisionSchema } from "@campus-exchange/contracts";
import { NextResponse } from "next/server";
import { apiData, mutationError, parseJson, requireStaff, verifyMutationOrigin } from "@/lib/api";

type Params = { params: Promise<{ id: string; appealId: string }> };

export async function POST(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireStaff(request); if (context instanceof NextResponse) return context;
  const input = await parseJson(request, moderationAppealDecisionSchema); if (input instanceof NextResponse) return input;
  const { id,appealId } = await params;
  const{data:moderationCase}=await context.supabase.from("moderation_cases").select("entity_type").eq("id",id).single();
  if(moderationCase?.entity_type==="automated_moderation"&&(input.action==="approve"||input.action==="reject")){
    const{data,error}=await context.supabase.rpc("resolve_automated_moderation_appeal",{target_appeal:appealId,chosen_action:input.action,internal_reason:input.internalReason,user_resolution:input.userResolution});
    return error?mutationError(request,error,"Unable to update this automated-content appeal."):apiData(request,{id:data,action:input.action});
  }
  const { data, error } = await context.supabase.rpc("resolve_moderation_appeal", {
    target_appeal: appealId, chosen_action: input.action, target_reviewer: input.reviewerId,
    internal_reason: input.internalReason, user_resolution: input.userResolution, reverse_action: input.reverseAction,
  });
  return error ? mutationError(request, error, "Unable to update this appeal.") : apiData(request, { id: data, action: input.action });
}
