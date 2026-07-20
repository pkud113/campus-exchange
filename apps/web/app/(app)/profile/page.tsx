import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Profile() {
  const db = await createSupabaseServerClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/profile");
  const { data } = await db.from("profiles").select("handle").eq("id", user.id).single();
  redirect(data?.handle ? `/u/${data.handle}` : "/onboarding");
}
