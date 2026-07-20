import { PageHeader } from "@/components/ui";
import { SocialFeed } from "./social-feed";

export const metadata = { title: "Social" };
export default async function SocialPage({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const { organization } = await searchParams;
  return <main className="dashboard narrow feature-page">
    <PageHeader eyebrow="Campus community" title="Social" description="Updates from verified students and organizations, filtered to the audience each author chose." />
    <SocialFeed organizationId={organization ?? null} />
  </main>;
}
