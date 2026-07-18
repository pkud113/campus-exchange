import { PageHeader } from "@/components/ui";
import { SocialFeed } from "./social-feed";

export const metadata = { title: "Social" };
export default function SocialPage() {
  return <main className="dashboard narrow feature-page">
    <PageHeader eyebrow="Campus community" title="Social" description="Updates from verified students and organizations, filtered to the audience each author chose." />
    <SocialFeed />
  </main>;
}
