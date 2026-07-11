import { isConfigured } from "@/lib/env";
export function GET(){return Response.json({status:"ok",service:"campus-exchange-web",dependencies:{supabaseConfigured:isConfigured()}},{headers:{"cache-control":"no-store"}})}
