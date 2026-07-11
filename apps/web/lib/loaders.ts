import { createSupabaseServerClient } from "./supabase/server";

export async function loadListings(filters?:{q?:string;category?:string}) {
  try { const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();if(!user)return [];let query=db.from("listings").select("id,title,description,category,condition,price_cents,currency,status,created_at,profiles!listings_seller_id_fkey(handle,display_name)").eq("status","active").order("created_at",{ascending:false}).limit(24);if(filters?.q)query=query.textSearch("search_vector",filters.q,{type:"websearch",config:"english"});if(filters?.category)query=query.eq("category",filters.category);const {data,error}=await query;return error?[]:data??[]; } catch { return []; }
}
export async function loadEvents() {
  try { const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();if(!user)return [];const {data,error}=await db.from("events").select("id,title,description,location,starts_at,ends_at,capacity,event_rsvps(count)").is("cancelled_at",null).gte("starts_at",new Date().toISOString()).order("starts_at").limit(12);return error?[]:data??[]; } catch { return []; }
}
