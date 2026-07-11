import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminQueue } from "./admin-queue";
export const metadata={title:"Moderation"};
export default async function Admin(){const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();const {data:roles}=await db.from("role_assignments").select("role").eq("profile_id",user!.id);if(!roles?.some(({role})=>role==="moderator"||role==="admin"))redirect("/exchange");const {data:aal}=await db.auth.mfa.getAuthenticatorAssuranceLevel();if(aal?.currentLevel!=="aal2")redirect("/profile?mfa=required");const {data:reports}=await db.from("reports").select("id,target_type,target_id,reason,details,message_snapshot,status,created_at,profiles!reports_reporter_id_fkey(handle,display_name)").in("status",["open","reviewing"]).order("created_at").limit(100);return <AdminQueue initialReports={reports??[]}/>}
