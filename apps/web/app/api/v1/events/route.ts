import { campusSelectorSchema, cursorSchema, eventInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, decodeCursor, encodeCursor, enforceRateLimit, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const c=await requireVerified(request); if(c instanceof NextResponse)return c; const url=new URL(request.url);const parsed=cursorSchema.safeParse(Object.fromEntries(url.searchParams));if(!parsed.success)return apiError(request,400,"bad_request","Invalid pagination parameters.");const page=parsed.data; const cursor=decodeCursor(page.cursor);
  const campus=campusSelectorSchema.safeParse(url.searchParams.get("campus")??"my");if(!campus.success)return apiError(request,400,"bad_request","Choose a valid campus filter.");
  let q=c.supabase.from("events").select("id,campus_id,title,description,location,starts_at,ends_at,capacity,cancelled_at,organizer_id,visibility,campuses!inner(name,short_name,slug)").is("cancelled_at",null).is("deleted_at",null).gte("starts_at",new Date().toISOString()).order("starts_at").order("id").limit(page.limit+1);
  if(campus.data==="my")q=q.eq("campus_id",c.campusId);else if(campus.data!=="all")q=q.eq("campuses.slug",campus.data);
  if(cursor)q=q.or(`starts_at.gt.${cursor.createdAt},and(starts_at.eq.${cursor.createdAt},id.gt.${cursor.id})`); const {data,error}=await q; if(error)return apiError(request,500,"internal_error","Unable to load events."); const rows=data??[]; const base=rows.slice(0,page.limit); const last=base.at(-1);
  const ids=base.map((row: any)=>row.id);const organizerIds=base.map((row: any)=>row.organizer_id);const[{data:profiles},{data:counts}]=ids.length?await Promise.all([c.supabase.rpc("safe_profile_cards",{target_ids:organizerIds}),c.supabase.rpc("event_rsvp_counts",{target_ids:ids})]):[{data:[]},{data:[]}];const profileMap=new Map((profiles??[]).map((row: any)=>[row.id,row]));const countMap=new Map((counts??[]).map((row: any)=>[row.event_id,Number(row.attendee_count)]));const visible=base.map((row: any)=>({...row,organizer:profileMap.get(row.organizer_id)??null,attendee_count:countMap.get(row.id)??0}));
  return NextResponse.json({data:visible,page:{nextCursor:rows.length>page.limit&&last?encodeCursor(last.starts_at,last.id):null}},{headers:{"cache-control":"private, no-store","x-request-id":c.requestId}});
}
export async function POST(request: Request) {
  const e=verifyMutationOrigin(request);if(e)return e;const c=await requireVerified(request);if(c instanceof NextResponse)return c;const limited=await enforceRateLimit(request,"event-create",c.userId,10,3600);if(limited)return limited;const input=await parseJson(request,eventInputSchema);if(input instanceof NextResponse)return input;
  const {data,error}=await c.supabase.from("events").insert({campus_id:c.campusId,organizer_id:c.userId,title:input.title,description:input.description,location:input.location,starts_at:input.startsAt,ends_at:input.endsAt,capacity:input.capacity,visibility:input.visibility,idempotency_key:input.idempotencyKey}).select().single();
  if(error?.code==="23505"){const old=await c.supabase.from("events").select().eq("organizer_id",c.userId).eq("idempotency_key",input.idempotencyKey).single();return apiData(request,old.data);} return error?apiError(request,500,"internal_error","Unable to create this event."):apiData(request,data,201);
}
