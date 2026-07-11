import { demoEvents, demoListings } from "./demo";
import { createSupabaseServerClient } from "./supabase/server";

export async function loadListings() {
  try { const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();if(!user)return demoListings;const {data,error}=await db.from("listings").select("id,title,description,category,condition,price_cents,currency,status,created_at,profiles!listings_seller_id_fkey(handle,display_name)").eq("status","active").order("created_at",{ascending:false}).limit(12);return error||!data?.length?demoListings:data; } catch { return demoListings; }
}
export async function loadEvents() {
  try { const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();if(!user)return demoEvents;const {data,error}=await db.from("events").select("id,title,description,location,starts_at,ends_at,capacity,event_rsvps(count)").is("cancelled_at",null).gte("starts_at",new Date().toISOString()).order("starts_at").limit(12);return error||!data?.length?demoEvents:data; } catch { return demoEvents; }
}
