import { PageHeader } from "@/components/ui";
import { SocialFeed } from "./social-feed";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Social" };
export default async function SocialPage({ searchParams }: { searchParams: Promise<{ scope?: string; post?: string }> }) {
  const { scope, post } = await searchParams;
  if (post && /^[0-9a-f-]{36}$/i.test(post)) redirect(`/social/posts/${post}`);
  const db = await createSupabaseServerClient();
  const { data: networkEnabled } = await db.rpc("network_features_enabled");
  const initialScope = ["for_you", "campus", "friends", "network"].includes(scope ?? "") ? scope as "for_you" | "campus" | "friends" | "network" : "for_you";
  return <main className="dashboard narrow feature-page social-page">
    <PageHeader eyebrow="Campus community" title="Discover what’s happening" description="A visibility-aware feed from verified students and organizations. Create and manage your own updates from your profile." />
    <SocialFeed initialScope={initialScope} networkEnabled={networkEnabled !== false} />
  </main>;
}
