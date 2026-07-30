import { evaluateSharedText } from "@/lib/content-moderation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supplied=request.headers.get("x-deployment-verification");
  const expected=process.env.DOMAIN_VERIFICATION_SECRET;
  if(!expected||!supplied||supplied.length!==expected.length||supplied!==expected)return Response.json({status:"forbidden"},{status:403,headers:{"cache-control":"no-store"}});
  try{
    const [result, database] = await Promise.all([
      evaluateSharedText("deployment_readiness",{text:"Students are welcome to share respectful campus updates."}),
      createSupabaseAdminClient().rpc("moderation_pipeline_readiness"),
    ]);
    const checks = database.data as { database?: boolean; hash?: boolean; binding?: boolean; recording?: boolean } | null;
    const healthy=result.decision==="allow"&&!database.error&&checks?.database===true&&checks.hash===true&&checks.binding===true&&checks.recording===true;
    return Response.json({status:healthy?"ok":"degraded",service:"content-moderation",provider:result.provider,model:result.model,policyVersion:"ce-shared-text-2026-07-v1",checks:{provider:result.decision==="allow",database:checks?.database===true,hash:checks?.hash===true,binding:checks?.binding===true,recording:checks?.recording===true}},{status:healthy?200:503,headers:{"cache-control":"no-store"}});
  }catch{return Response.json({status:"degraded",service:"content-moderation",checks:{provider:false,database:false,hash:false,binding:false,recording:false}},{status:503,headers:{"cache-control":"no-store"}});}
}
