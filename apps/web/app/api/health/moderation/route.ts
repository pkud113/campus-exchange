import { evaluateSharedText } from "@/lib/content-moderation";

export async function GET(request: Request) {
  const supplied=request.headers.get("x-deployment-verification");
  const expected=process.env.DOMAIN_VERIFICATION_SECRET;
  if(!expected||!supplied||supplied.length!==expected.length||supplied!==expected)return Response.json({status:"forbidden"},{status:403,headers:{"cache-control":"no-store"}});
  try{
    const result=await evaluateSharedText("deployment_readiness",{text:"Students are welcome to share respectful campus updates."});
    const healthy=result.decision==="allow";
    return Response.json({status:healthy?"ok":"degraded",service:"content-moderation",provider:result.provider,model:result.model,policyVersion:"ce-shared-text-2026-07-v1"},{status:healthy?200:503,headers:{"cache-control":"no-store"}});
  }catch{return Response.json({status:"degraded",service:"content-moderation"},{status:503,headers:{"cache-control":"no-store"}});}
}
