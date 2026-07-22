import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Profile({ searchParams }: { searchParams: Promise<{ tab?: string; compose?: string }> }) {
  const query = await searchParams;
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/profile");
  const { data: profile } = await db.from("profiles").select("handle").eq("id", user.id).single();
  if (!profile?.handle) redirect("/settings");
  const params = new URLSearchParams(); params.set("tab", query.tab ?? "posts"); if (query.compose) params.set("compose", query.compose);
  redirect(`/u/${profile.handle}?${params.toString()}${query.compose ? "#composer" : ""}`);
}
