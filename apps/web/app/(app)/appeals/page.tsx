import { PageHeader } from "@/components/ui";
import { AppealsClient } from "./appeals-client";
export const metadata = { title: "Safety appeals" };
export default function AppealsPage() { return <main className="dashboard narrow"><PageHeader eyebrow="TRUST &amp; SAFETY" title="Safety outcomes & appeals" description="Review moderation outcomes affecting your account or content and submit one factual appeal when eligible." /><AppealsClient /></main>; }
