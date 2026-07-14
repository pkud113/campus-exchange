import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function DiscussionsLayout({ children }: { children: React.ReactNode }) {
  const db = await createSupabaseServerClient();
  const { data } = await db.rpc("discussions_enabled");
  if (data !== true) notFound();
  return children;
}
