import { campusSelectorSchema, cursorSchema, listingInputSchema } from "@campus-exchange/contracts";
import { apiData, apiError, decodeCursor, encodeCursor, enforceRateLimit, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";
import { authorizeSharedTextMutation } from "@/lib/content-moderation";

export async function GET(request: Request) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const url = new URL(request.url); const parsed=cursorSchema.safeParse(Object.fromEntries(url.searchParams));if(!parsed.success)return apiError(request,400,"bad_request","Invalid pagination parameters.");const page=parsed.data; const cursor = decodeCursor(page.cursor);
  const campus = campusSelectorSchema.safeParse(url.searchParams.get("campus") ?? "my");
  if (!campus.success) return apiError(request,400,"bad_request","Choose a valid campus filter.");
  let query = context.supabase.from("listings").select("id,campus_id,seller_id,title,description,category,condition,price_cents,currency,status,visibility,exchange_methods,legacy_exchange_unspecified,created_at,campuses!inner(name,short_name,slug)").eq("status", "active").is("deleted_at",null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(page.limit + 1);
  if (campus.data === "my") query = query.eq("campus_id", context.campusId);
  else if (campus.data !== "all") query = query.eq("campuses.slug", campus.data);
  const search = url.searchParams.get("q")?.trim(); if (search) query = query.textSearch("search_vector", search, { type: "websearch", config: "english" });
  const category = url.searchParams.get("category"); if (category) query = query.eq("category", category);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const { data, error } = await query; if (error) return apiError(request, 500, "internal_error", "Unable to load listings.");
  const rows = data ?? []; const hasMore = rows.length > page.limit; const base = rows.slice(0, page.limit); const last = base.at(-1);
  const ids=base.map((row: any)=>row.id);const sellerIds=base.map((row: any)=>row.seller_id);
  const [{data:profiles},{data:media}]=ids.length?await Promise.all([context.supabase.rpc("safe_profile_cards",{target_ids:sellerIds}),context.supabase.rpc("safe_listing_media",{target_ids:ids})]):[{data:[]},{data:[]}];
  const profileMap=new Map((profiles??[]).map((row: any)=>[row.id,row]));const visible=base.map((row: any)=>({...row,seller:profileMap.get(row.seller_id)??null,media_uploads:(media??[]).filter((item: any)=>item.listing_id===row.id)}));
  return NextResponse.json({ data: visible, page: { nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null } }, { headers: { "cache-control": "private, no-store", "x-request-id": context.requestId } });
}

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context;
  const limited=await enforceRateLimit(request,"listing-create",context.userId,10,3600);if(limited)return limited;
  const input = await parseJson(request, listingInputSchema); if (input instanceof NextResponse) return input;
  const moderation=await authorizeSharedTextMutation(request,context,{surface:"listing",operation:"create",fields:{title:input.title,description:input.description},idempotencyKey:input.idempotencyKey});if(moderation instanceof Response)return moderation;
  const { data, error } = await context.supabase.from("listings").insert({ campus_id: context.campusId, seller_id: context.userId, title: input.title, description: input.description, category: input.category, condition: input.condition, price_cents: input.priceCents, currency: input.currency, status: "draft", visibility:input.visibility,exchange_methods:input.exchangeMethods,legacy_exchange_unspecified:false,idempotency_key: input.idempotencyKey }).select().single();
  if (error?.code === "23505") { const existing = await context.supabase.from("listings").select().eq("seller_id", context.userId).eq("idempotency_key", input.idempotencyKey).single(); return apiData(request, existing.data); }
  return error ? apiError(request, 500, "internal_error", "Unable to publish this listing.") : apiData(request, data, 201);
}
